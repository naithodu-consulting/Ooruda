'use server';

import { revalidatePath } from 'next/cache';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { logAuditEvent } from '~/lib/audit-log';
import { getAssociationRole } from '~/lib/rbac';

import {
  type RecordPaymentInput,
  RecordPaymentSchema,
} from './payments-schema';

const PAYMENTS_PATH = '/home/[account]/payments';

type ActionResult = { success: boolean; error?: string };

async function requireBillingAccess(
  associationId: string,
): Promise<string | null> {
  const role = await getAssociationRole(associationId);

  if (role !== 'assoc_admin' && role !== 'billing_operator') {
    return 'Only an association admin or billing operator can do that.';
  }

  return null;
}

/**
 * Record a payment against a bill using the atomic record_payment RPC function.
 * Verifies billing access, validates inputs, and executes atomically.
 */
export async function recordPaymentAction(
  billId: string,
  associationId: string,
  input: RecordPaymentInput,
): Promise<ActionResult> {
  const roleError = await requireBillingAccess(associationId);

  if (roleError) {
    return { success: false, error: roleError };
  }

  const parsed = RecordPaymentSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Please check the form.',
    };
  }

  const { amount, mode, paid_by_role, reference_no } = parsed.data;
  const client = getSupabaseServerClient();

  const { data: paymentId, error } = await client.rpc('record_payment' as any, {
    p_bill_id: billId,
    p_association_id: associationId,
    p_amount: amount,
    p_mode: mode,
    p_paid_by_role: paid_by_role,
  });

  if (error) {
    await logAuditEvent({
      associationId,
      action: 'payment.record.failed',
      entityType: 'payment',
      summary: `Failed to record payment for bill ${billId}: ${error.message}`,
    });
    return { success: false, error: error.message };
  }

  // Persist reference_no if provided (RPC doesn't accept it, so update after).
  if (reference_no?.trim()) {
    await client
      .from('payments')
      .update({ reference_no: reference_no.trim() })
      .eq('id', paymentId as string);
  }

  const { data: bill } = await client
    .from('bills')
    .select('bill_no, units!inner(unit_no)')
    .eq('id', billId)
    .single();

  await logAuditEvent({
    associationId,
    action: 'payment.recorded',
    entityType: 'payment',
    entityId: paymentId as unknown as string,
    summary: `Unit ${bill?.units?.unit_no ?? '?'} — ₹${amount.toLocaleString('en-IN')} collected via ${mode}`,
  });

  revalidatePath(PAYMENTS_PATH, 'page');

  return { success: true };
}

/**
 * Void (delete) a payment. Admin-only — cascades to its receipt and
 * triggers a database-level update to recompute the bill's paid_amount/status.
 */
export async function voidPaymentAction(
  paymentId: string,
  billId: string,
  associationId: string,
): Promise<ActionResult> {
  const role = await getAssociationRole(associationId);

  if (role !== 'assoc_admin') {
    return { success: false, error: 'Only an association admin can do that.' };
  }

  const client = getSupabaseServerClient();

  const { error: deleteError } = await client
    .from('payments')
    .delete()
    .eq('id', paymentId);

  if (deleteError) {
    await logAuditEvent({
      associationId,
      action: 'payment.void.failed',
      entityType: 'payment',
      entityId: paymentId,
      summary: `Failed to void payment ${paymentId}: ${deleteError.message}`,
    });
    return { success: false, error: deleteError.message };
  }

  await logAuditEvent({
    associationId,
    action: 'payment.voided',
    entityType: 'payment',
    entityId: paymentId,
    summary: 'Voided a payment',
  });

  revalidatePath(PAYMENTS_PATH, 'page');

  return { success: true };
}

const BILLING_DOCUMENTS_BUCKET = 'billing-documents';

/**
 * Super-admin-only bulk delete: wipes every payment (cascading to
 * receipts) for the association, leaving the bills themselves intact —
 * they revert to their pre-payment Unpaid/Overdue state via the existing
 * `sync_bill_payment_status` trigger.
 *
 * Authorization is enforced inside the `super_admin_delete_all_payments`
 * RPC itself (security definer, checks `is_super_admin()`), not via
 * `requireBillingAccess`, for the same reason as `deleteAllBillsAction` in
 * billing-actions.ts — a super admin viewing an "opened workspace"
 * resolves to `assoc_admin` too, so that role check can't distinguish a
 * real customer admin from a super admin doing a mass wipe.
 */
export async function deleteAllPaymentsAction(
  associationId: string,
): Promise<
  ActionResult & { deletedPayments?: number; deletedReceipts?: number }
> {
  const client = getSupabaseServerClient();

  const { data: isSuperAdmin } = await client.rpc('is_super_admin');
  if (!isSuperAdmin) {
    return { success: false, error: 'Only a super admin can do that.' };
  }

  const { data, error } = await client
    .rpc('super_admin_delete_all_payments', {
      p_association_id: associationId,
    })
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  // Best-effort cleanup of orphaned cached receipt PDFs.
  const admin = getSupabaseServerAdminClient();
  const prefix = `receipts/${associationId}`;
  const { data: objects } = await admin.storage
    .from(BILLING_DOCUMENTS_BUCKET)
    .list(prefix);
  if (objects && objects.length > 0) {
    await admin.storage
      .from(BILLING_DOCUMENTS_BUCKET)
      .remove(objects.map((o) => `${prefix}/${o.name}`));
  }

  await logAuditEvent({
    associationId,
    action: 'payments.bulk_deleted',
    entityType: 'payment',
    summary: `Deleted ${data.deleted_payments} payments, ${data.deleted_receipts} receipts (super admin bulk delete)`,
  });

  revalidatePath(PAYMENTS_PATH, 'page');
  revalidatePath('/home/[account]/billing', 'page');

  return {
    success: true,
    deletedPayments: data.deleted_payments,
    deletedReceipts: data.deleted_receipts,
  };
}
