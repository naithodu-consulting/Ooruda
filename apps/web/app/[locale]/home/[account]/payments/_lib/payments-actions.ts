'use server';

import { revalidatePath } from 'next/cache';

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

function nextBillStatus(paidAmount: number, totalAmount: number): string {
  if (paidAmount >= totalAmount) {
    return 'Paid';
  }

  if (paidAmount > 0) {
    return 'Partial';
  }

  return 'Unpaid';
}

/**
 * Record a payment against a bill, update the bill's paid_amount/status,
 * and issue a receipt. Rejects payments that would overpay the bill.
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

  const { amount, mode, paid_by_role } = parsed.data;
  const client = getSupabaseServerClient();

  const { data: bill } = await client
    .from('bills')
    .select('id, bill_no, total_amount, paid_amount')
    .eq('id', billId)
    .eq('association_id', associationId)
    .single();

  if (!bill) {
    return { success: false, error: 'Bill not found.' };
  }

  const outstanding = bill.total_amount - bill.paid_amount;

  if (amount > outstanding) {
    return {
      success: false,
      error: `Amount exceeds the outstanding balance (${outstanding.toFixed(2)}).`,
    };
  }

  const { count: existingPaymentCount } = await client
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('bill_id', billId);

  const { data: payment, error: paymentError } = await client
    .from('payments')
    .insert({
      association_id: associationId,
      bill_id: billId,
      amount,
      mode,
      paid_by_role,
    })
    .select('id')
    .single();

  if (paymentError || !payment) {
    return {
      success: false,
      error: paymentError?.message ?? 'Could not record the payment.',
    };
  }

  const receiptNo = `${bill.bill_no}-R${(existingPaymentCount ?? 0) + 1}`;

  const { error: receiptError } = await client.from('receipts').insert({
    payment_id: payment.id,
    receipt_no: receiptNo,
  });

  if (receiptError) {
    return { success: false, error: receiptError.message };
  }

  const newPaidAmount = bill.paid_amount + amount;

  const { error: billError } = await client
    .from('bills')
    .update({
      paid_amount: newPaidAmount,
      status: nextBillStatus(newPaidAmount, bill.total_amount),
    })
    .eq('id', billId);

  if (billError) {
    return { success: false, error: billError.message };
  }

  await logAuditEvent({
    associationId,
    action: 'payment.recorded',
    entityType: 'payment',
    entityId: payment.id,
    summary: `Recorded a ${mode} payment for bill ${bill.bill_no}`,
  });

  revalidatePath(PAYMENTS_PATH, 'page');

  return { success: true };
}

/**
 * Void (delete) a payment. Admin-only — cascades to its receipt and
 * recomputes the bill's paid_amount/status from the remaining payments.
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
    return { success: false, error: deleteError.message };
  }

  const { data: bill } = await client
    .from('bills')
    .select('id, total_amount')
    .eq('id', billId)
    .single();

  if (!bill) {
    return { success: false, error: 'Bill not found.' };
  }

  const { data: remainingPayments } = await client
    .from('payments')
    .select('amount')
    .eq('bill_id', billId);

  const newPaidAmount = (remainingPayments ?? []).reduce(
    (sum, p) => sum + p.amount,
    0,
  );

  const { error: billError } = await client
    .from('bills')
    .update({
      paid_amount: newPaidAmount,
      status: nextBillStatus(newPaidAmount, bill.total_amount),
    })
    .eq('id', billId);

  if (billError) {
    return { success: false, error: billError.message };
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
