import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import {
  type StatementEntry,
  StatementTable,
} from './_components/statement-table';

interface Props {
  params: Promise<{ account: string }>;
  searchParams: Promise<{ fy?: string; type?: string; unit?: string }>;
}

export const metadata = { title: 'Statement' };

export default async function StatementPage({ params, searchParams }: Props) {
  const { account } = await params;
  const {
    fy: initialFy,
    type: initialType,
    unit: initialUnit,
  } = await searchParams;
  const { accountId, userId } = await requireRole(account, [
    'prop_owner',
    'tenant',
  ]);

  const client = getSupabaseServerClient();

  const { data: association } = await client
    .from('associations')
    .select('id')
    .eq('account_id', accountId)
    .single();

  if (!association) {
    throw new Error('Unable to load association for this account.');
  }

  // Resolve accessible units (same logic as payments page).
  const [{ data: ownedUnits }, { data: tenancies }] = await Promise.all([
    client
      .from('units')
      .select('id, unit_no')
      .eq('association_id', association.id)
      .eq('owner_id', userId)
      .order('unit_no'),
    client
      .from('tenancies')
      .select('id, unit_id, units!inner(id, unit_no, association_id)')
      .eq('tenant_id', userId)
      .eq('status', 'active')
      .eq('units.association_id', association.id),
  ]);

  const ownedUnitList = (ownedUnits ?? []) as { id: string; unit_no: string }[];
  const rentedUnitList = (tenancies ?? []).map(
    (t) => t.units as unknown as { id: string; unit_no: string },
  );

  const seenIds = new Set<string>();
  const allUnits: { id: string; unit_no: string }[] = [];
  for (const u of [...ownedUnitList, ...rentedUnitList]) {
    if (!seenIds.has(u.id)) {
      seenIds.add(u.id);
      allUnits.push(u);
    }
  }

  if (allUnits.length === 0) {
    return (
      <PageBody>
        <TeamAccountLayoutPageHeader
          account={account}
          title={<Trans i18nKey="association.nav.statement" />}
          description="No units assigned to your account yet."
        />
      </PageBody>
    );
  }

  const unitIds = allUnits.map((u) => u.id);
  const unitNoMap = new Map(allUnits.map((u) => [u.id, u.unit_no]));

  // ── 1. Bills with nested payments ──────────────────────────────────────────
  // Bills → debit entries (due raised). Payments nested inside → credit entries.
  const { data: billRows } = await client
    .from('bills')
    .select(
      'id, unit_id, bill_type, bill_no, total_amount, generated_at, bill_line_items(description), payments(id, amount, mode, reference_no, paid_at, status, reversed_at)',
    )
    .in('unit_id', unitIds)
    .eq('association_id', association.id)
    .order('generated_at', { ascending: true });

  // ── 2. Cash ledger — advances only ─────────────────────────────────────────
  // due_payment rows are now sourced from the payments table above.
  // We keep advance_payment, advance_applied, and legacy due entries.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: advanceRows } = await (client as any)
    .from('cash_ledger')
    .select(
      'id, unit_id, entry_type, bill_type, amount, direction, entry_date, notes',
    )
    .in('unit_id', unitIds)
    .eq('association_id', association.id)
    .in('entry_type', ['due', 'advance_payment', 'advance_applied'])
    .order('entry_date', { ascending: true })
    .order('created_at', { ascending: true });

  // ── 3. Build flat entry list ────────────────────────────────────────────────
  const raw: Omit<StatementEntry, 'runningBalance'>[] = [];

  for (const bill of billRows ?? []) {
    const unitNo = unitNoMap.get(bill.unit_id) ?? '?';
    const billType = (bill.bill_type as string) ?? 'other_charges';

    // Derive a human-readable charge name from line items.
    // For electricity/maintenance the bill_type label is clear; for other_charges
    // we surface the actual charge names (e.g. "Water Charges", "Parking Fee").
    const lineItems = (bill.bill_line_items as { description: string }[]) ?? [];
    const primaryDescriptions = lineItems
      .map((li) => li.description)
      .filter((d) => !/gst|tax/i.test(d));
    const uniqueDescriptions = [...new Set(primaryDescriptions)];
    const charge_name =
      billType === 'other_charges' && uniqueDescriptions.length > 0
        ? uniqueDescriptions.join(', ')
        : null;

    // Debit: due raised when bill was generated
    raw.push({
      id: `bill-${bill.id}`,
      unit_id: bill.unit_id,
      unit_no: unitNo,
      entry_type: 'due',
      bill_type: billType,
      bill_no: bill.bill_no,
      charge_name,
      amount: Number(bill.total_amount),
      direction: 'debit',
      entry_date: (bill.generated_at as string).slice(0, 10),
      notes: null,
      mode: null,
    });

    // Credits: every payment recorded against this bill (including reversed ones).
    // Cast via unknown: status/reversed_at columns added in 20260718000000_payment_reversal.sql;
    // types will be regenerated after the migration is applied.
    for (const p of (bill.payments as unknown as {
      id: string;
      amount: number;
      mode: string;
      reference_no: string | null;
      paid_at: string;
      status: string;
      reversed_at: string | null;
    }[]) ?? []) {
      raw.push({
        id: `payment-${p.id}`,
        unit_id: bill.unit_id,
        unit_no: unitNo,
        entry_type: 'due_payment',
        bill_type: billType,
        bill_no: bill.bill_no,
        charge_name,
        amount: Number(p.amount),
        direction: 'credit',
        entry_date: (p.paid_at as string).slice(0, 10),
        notes: p.reference_no ?? null,
        mode: p.mode,
        payment_status: (p.status as 'active' | 'reversed') ?? 'active',
      });

      // For reversed payments, emit a matching debit entry on the reversal date
      // so the running balance correctly reflects the refund.
      if (p.status === 'reversed' && p.reversed_at) {
        raw.push({
          id: `reversal-${p.id}`,
          unit_id: bill.unit_id,
          unit_no: unitNo,
          entry_type: 'reversal',
          bill_type: billType,
          bill_no: bill.bill_no,
          charge_name,
          amount: Number(p.amount),
          direction: 'debit',
          entry_date: (p.reversed_at as string).slice(0, 10),
          notes: 'Refunded by Razorpay',
          mode: null,
        });
      }
    }
  }

  // Advance and legacy due entries from cash_ledger
  for (const e of (advanceRows as {
    id: string;
    unit_id: string;
    entry_type: string;
    bill_type: string;
    amount: number;
    direction: string;
    entry_date: string;
    notes: string | null;
  }[]) ?? []) {
    raw.push({
      id: `ledger-${e.id}`,
      unit_id: e.unit_id,
      unit_no: unitNoMap.get(e.unit_id) ?? '?',
      entry_type: e.entry_type as StatementEntry['entry_type'],
      bill_type: e.bill_type,
      bill_no: null,
      charge_name: null,
      amount: Number(e.amount),
      direction: e.direction as 'debit' | 'credit',
      entry_date: e.entry_date,
      notes: e.notes,
      mode: null,
    });
  }

  // ── 4. Sort oldest-first, compute running balance per unit, then reverse ───
  // On the same date: dues before payments (debit before credit).
  raw.sort((a, b) => {
    if (a.entry_date !== b.entry_date)
      return a.entry_date < b.entry_date ? -1 : 1;
    // Same date: debits first so balance dips before recovering
    if (a.direction !== b.direction) return a.direction === 'debit' ? -1 : 1;
    return 0;
  });

  const perUnitBalance = new Map<string, number>();
  const entries: StatementEntry[] = raw.map((e) => {
    const prev = perUnitBalance.get(e.unit_id) ?? 0;
    const delta = e.direction === 'credit' ? e.amount : -e.amount;
    const next = prev + delta;
    perUnitBalance.set(e.unit_id, next);
    return { ...e, runningBalance: next };
  });

  entries.reverse();

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.statement" />}
        description="Your unit's statement. Most recent transactions first."
      />
      <StatementTable
        account={account}
        units={allUnits}
        entries={entries}
        initialFy={initialFy}
        initialType={initialType}
        initialUnit={initialUnit}
      />
    </PageBody>
  );
}
