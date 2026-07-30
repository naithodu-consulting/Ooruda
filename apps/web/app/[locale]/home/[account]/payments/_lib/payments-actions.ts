'use server';

import { revalidatePath } from 'next/cache';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { logAuditEvent } from '~/lib/audit-log';
import { sanitizeActionError } from '~/lib/errors/sanitize-action-error';
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
    return "You don't have permission to do this. Contact your association admin if you think this is incorrect.";
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

  const { data: paymentId, error } = await client.rpc('record_payment', {
    p_bill_id: billId,
    p_association_id: associationId,
    p_amount: amount,
    p_mode: mode,
    p_paid_by_role: paid_by_role,
    p_razorpay_payment_id: null,
    p_razorpay_order_id: null,
    p_payment_batch_id: null,
  });

  if (error) {
    const { userMessage } = await sanitizeActionError(error, {
      action: 'recordPayment',
      associationId,
      billId,
    });
    await logAuditEvent({
      associationId,
      action: 'payment.record.failed',
      entityType: 'payment',
      summary: `Failed to record payment for bill ${billId}: ${error.message}`,
    });
    return { success: false, error: userMessage };
  }

  // Persist reference_no if provided. The RPC doesn't accept it and uses
  // SECURITY DEFINER, so RLS blocks a follow-up UPDATE via the regular client.
  // Use the admin client (access already validated via requireBillingAccess).
  if (reference_no?.trim()) {
    const adminClient = getSupabaseServerAdminClient();
    await adminClient
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
    return {
      success: false,
      error:
        "You don't have the required permission. Contact your association admin.",
    };
  }

  const client = getSupabaseServerClient();

  const { error: deleteError } = await client
    .from('payments')
    .delete()
    .eq('id', paymentId);

  if (deleteError) {
    const { userMessage } = await sanitizeActionError(deleteError, {
      action: 'voidPayment',
      associationId,
      paymentId,
    });
    await logAuditEvent({
      associationId,
      action: 'payment.void.failed',
      entityType: 'payment',
      entityId: paymentId,
      summary: `Failed to void payment ${paymentId}: ${deleteError.message}`,
    });
    return { success: false, error: userMessage };
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
    return {
      success: false,
      error: "You don't have the required permission.",
    };
  }

  const { data, error } = await client
    .rpc('super_admin_delete_all_payments', {
      p_association_id: associationId,
    })
    .single();

  if (error) {
    const { userMessage } = await sanitizeActionError(error, {
      action: 'deleteAllPayments',
      associationId,
    });
    return { success: false, error: userMessage };
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
