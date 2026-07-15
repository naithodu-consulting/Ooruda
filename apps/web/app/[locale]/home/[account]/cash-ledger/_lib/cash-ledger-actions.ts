'use server';

import { revalidatePath } from 'next/cache';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { logAuditEvent } from '~/lib/audit-log';
import { getAssociationRole } from '~/lib/rbac';

import { createCashLedgerEntry } from './cash-ledger-service';

// Tables added by cash-ledger migration are not yet in generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const uc = (client: unknown) => client as any;

const CASH_LEDGER_PATH = '/home/[account]/cash-ledger';
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

// ── Add single entry ─────────────────────────────────────────

export interface AddCashLedgerEntryInput {
  unit_id: string;
  entry_type: 'due' | 'advance_payment';
  bill_type: string;
  amount: number;
  paid_by_user_id?: string | null;
  paid_by_name: string;
  entry_date: string; // YYYY-MM-DD
  notes?: string;
}

export async function addCashLedgerEntryAction(
  associationId: string,
  input: AddCashLedgerEntryInput,
): Promise<ActionResult> {
  const roleError = await requireBillingAccess(associationId);
  if (roleError) return { success: false, error: roleError };

  if (!input.unit_id) return { success: false, error: 'Unit is required.' };
  if (!input.bill_type)
    return { success: false, error: 'Bill type is required.' };
  if (!input.amount || input.amount <= 0)
    return { success: false, error: 'Amount must be greater than zero.' };
  if (!input.paid_by_name?.trim())
    return { success: false, error: 'Paid by name is required.' };

  const client = getSupabaseServerClient();

  // Verify unit belongs to association.
  const { data: unit, error: unitError } = await client
    .from('units')
    .select('id')
    .eq('id', input.unit_id)
    .eq('association_id', associationId)
    .single();

  if (unitError || !unit) {
    return { success: false, error: 'Unit not found in this association.' };
  }

  const direction = input.entry_type === 'advance_payment' ? 'credit' : 'debit';

  try {
    await createCashLedgerEntry(client, {
      association_id: associationId,
      unit_id: input.unit_id,
      entry_type: input.entry_type,
      bill_type: input.bill_type,
      amount: input.amount,
      direction,
      paid_by_user_id: input.paid_by_user_id ?? null,
      paid_by_name: input.paid_by_name.trim(),
      entry_date: input.entry_date,
      notes: input.notes?.trim() ?? null,
    });
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  await logAuditEvent({
    associationId,
    action: `cash_ledger.${input.entry_type}.created`,
    entityType: 'cash_ledger',
    summary: `Added ${input.entry_type === 'advance_payment' ? 'advance payment' : 'due'} of ₹${input.amount} for ${input.bill_type} on unit`,
  });

  revalidatePath(CASH_LEDGER_PATH, 'page');
  revalidatePath(PAYMENTS_PATH, 'page');
  return { success: true };
}

// ── CSV import ───────────────────────────────────────────────

export interface CashLedgerImportRow {
  unit_no: string;
  entry_type: string; // 'Due' | 'Advance Payment'
  bill_type: string;
  amount: number;
  paid_by: string;
  paid_on?: string; // YYYY-MM-DD or empty
}

export interface CashLedgerImportResult {
  success: boolean;
  imported: number;
  skipped: string[];
  error?: string;
}

const FALLBACK_DATE = '2026-06-30';

export async function bulkImportCashLedgerAction(
  associationId: string,
  rows: CashLedgerImportRow[],
): Promise<CashLedgerImportResult> {
  const roleError = await requireBillingAccess(associationId);
  if (roleError)
    return { success: false, imported: 0, skipped: [], error: roleError };

  const MAX_IMPORT_ROWS = 500;
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      success: false,
      imported: 0,
      skipped: [],
      error: `Import is limited to ${MAX_IMPORT_ROWS} rows per batch.`,
    };
  }

  if (rows.length === 0) {
    return { success: true, imported: 0, skipped: [] };
  }

  const client = getSupabaseServerClient();

  const { data: units } = await client
    .from('units')
    .select('id, unit_no')
    .eq('association_id', associationId);

  const unitByNo = new Map<string, string>(
    (units ?? []).map((u) => [u.unit_no.toLowerCase().trim(), u.id]),
  );

  const skipped: string[] = [];
  const toInsert: Parameters<typeof createCashLedgerEntry>[1][] = [];

  for (const row of rows) {
    const unitId = unitByNo.get(row.unit_no.toLowerCase().trim());
    if (!unitId) {
      skipped.push(`Unit "${row.unit_no}" not found`);
      continue;
    }

    const normalizedType = row.entry_type.trim().toLowerCase();
    let entryType: 'due' | 'advance_payment';
    let direction: 'debit' | 'credit';

    if (normalizedType === 'due') {
      entryType = 'due';
      direction = 'debit';
    } else if (
      normalizedType === 'advance payment' ||
      normalizedType === 'advance_payment'
    ) {
      entryType = 'advance_payment';
      direction = 'credit';
    } else {
      skipped.push(
        `Row for Unit "${row.unit_no}": unknown type "${row.entry_type}"`,
      );
      continue;
    }

    if (!row.bill_type?.trim()) {
      skipped.push(`Row for Unit "${row.unit_no}": bill type is required`);
      continue;
    }

    if (!row.amount || row.amount <= 0) {
      skipped.push(`Row for Unit "${row.unit_no}": amount must be > 0`);
      continue;
    }

    const entryDate =
      row.paid_on && /^\d{4}-\d{2}-\d{2}$/.test(row.paid_on.trim())
        ? row.paid_on.trim()
        : FALLBACK_DATE;

    toInsert.push({
      association_id: associationId,
      unit_id: unitId,
      entry_type: entryType,
      bill_type: row.bill_type.trim().toLowerCase(),
      amount: row.amount,
      direction,
      paid_by_name: row.paid_by?.trim() || 'Unknown',
      entry_date: entryDate,
    });
  }

  if (toInsert.length > 0) {
    const { error } = await uc(client).from('cash_ledger').insert(toInsert);
    if (error) {
      return { success: false, imported: 0, skipped, error: error.message };
    }
  }

  await logAuditEvent({
    associationId,
    action: 'cash_ledger.bulk_imported',
    entityType: 'cash_ledger',
    summary: `Imported ${toInsert.length} cash ledger entries (${skipped.length} skipped)`,
  });

  revalidatePath(CASH_LEDGER_PATH, 'page');
  revalidatePath(PAYMENTS_PATH, 'page');
  return { success: true, imported: toInsert.length, skipped };
}

// ── Pay a cash-ledger due ────────────────────────────────────

export interface RecordDuePaymentInput {
  unit_id: string;
  bill_type: string;
  amount: number;
  mode: 'Cash' | 'Bank Transfer' | 'UPI' | 'Cheque';
  reference_no?: string;
}

export interface RecordDuePaymentResult extends ActionResult {
  paymentId?: string;
}

export async function recordDuePaymentAction(
  associationId: string,
  input: RecordDuePaymentInput,
): Promise<RecordDuePaymentResult> {
  const roleError = await requireBillingAccess(associationId);
  if (roleError) return { success: false, error: roleError };

  if (!input.amount || input.amount <= 0)
    return { success: false, error: 'Amount must be greater than zero.' };

  const client = getSupabaseServerClient();

  // Single RPC call — both cash_ledger_payments insert and cash_ledger credit
  // entry are written atomically; receipt number is generated inside the RPC.
  const { data: paymentId, error } = await uc(client).rpc('record_due_payment', {
    p_association_id: associationId,
    p_unit_id: input.unit_id,
    p_bill_type: input.bill_type,
    p_amount: input.amount,
    p_mode: input.mode,
    p_reference_no: input.reference_no?.trim() || null,
  });

  if (error) return { success: false, error: (error as { message: string }).message };

  await logAuditEvent({
    associationId,
    action: 'cash_ledger.due_payment.recorded',
    entityType: 'cash_ledger',
    summary: `Recorded ₹${input.amount} payment via ${input.mode} for ${input.bill_type} due`,
  });

  revalidatePath(CASH_LEDGER_PATH, 'page');
  revalidatePath(PAYMENTS_PATH, 'page');
  return { success: true, paymentId: paymentId as string };
}

// ── Fetch ledger entries for a unit ─────────────────────────

export async function getCashLedgerEntriesAction(
  associationId: string,
  unitId: string,
  billType?: string,
): Promise<{
  success: boolean;
  entries?: CashLedgerEntryRow[];
  error?: string;
}> {
  const role = await getAssociationRole(associationId);
  if (!role) return { success: false, error: 'Not authorized.' };

  const client = getSupabaseServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (uc(client) as any)
    .from('cash_ledger')
    .select(
      'id, entry_type, bill_type, amount, direction, entry_date, paid_by_name, notes, created_at, reference_bill_id',
    )
    .eq('association_id', associationId)
    .eq('unit_id', unitId)
    .order('entry_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (billType && billType !== 'all') {
    query = query.eq('bill_type', billType);
  }

  const { data, error } = await query;
  if (error)
    return { success: false, error: (error as { message: string }).message };

  return { success: true, entries: (data ?? []) as CashLedgerEntryRow[] };
}

// ── Fetch owner + active tenant for a unit ──────────────────

export interface UnitMember {
  userId: string;
  name: string;
  role: 'owner' | 'tenant';
}

export async function getUnitMembersAction(
  associationId: string,
  unitId: string,
): Promise<{ success: boolean; members?: UnitMember[]; error?: string }> {
  const role = await getAssociationRole(associationId);
  if (!role) return { success: false, error: 'Not authorized.' };

  const client = getSupabaseServerClient();

  // Fetch unit owner_id.
  const { data: unit } = await client
    .from('units')
    .select('owner_id')
    .eq('id', unitId)
    .eq('association_id', associationId)
    .single();

  // Fetch active tenant.
  const { data: tenancy } = await client
    .from('tenancies')
    .select('tenant_id')
    .eq('unit_id', unitId)
    .is('end_date', null)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const userIds = [unit?.owner_id ?? null, tenancy?.tenant_id ?? null].filter(
    (id): id is string => !!id,
  );

  if (userIds.length === 0) return { success: true, members: [] };

  const { data: profiles } = await client
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds);

  const profileMap = Object.fromEntries(
    (profiles ?? []).map((p) => [p.id, p.full_name ?? '']),
  );

  const members: UnitMember[] = [];
  if (unit?.owner_id) {
    members.push({
      userId: unit.owner_id,
      name: profileMap[unit.owner_id] ?? 'Owner',
      role: 'owner',
    });
  }
  if (tenancy?.tenant_id) {
    members.push({
      userId: tenancy.tenant_id,
      name: profileMap[tenancy.tenant_id] ?? 'Tenant',
      role: 'tenant',
    });
  }

  return { success: true, members };
}

export interface CashLedgerEntryRow {
  id: string;
  entry_type: string;
  bill_type: string;
  amount: number;
  direction: string;
  entry_date: string;
  paid_by_name: string;
  notes: string | null;
  created_at: string;
  reference_bill_id: string | null;
}
