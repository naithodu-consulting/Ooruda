import { NextResponse } from 'next/server';

import { enhanceRouteHandler } from '@kit/next/routes';
import { billTypeLabel, renderStatementPdf } from '@kit/pdf-templates';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

const FY_ALL = '__all__';

function currentFY(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${String(year + 1).slice(2)}`;
}

function fyRange(fy: string): { from: string; to: string } | null {
  const match = fy.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const startYear = parseInt(match[1]!);
  return {
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`,
  };
}

function entryDescription(
  entryType: string,
  billType: string,
  chargeName: string | null,
): string {
  const bt = chargeName ?? billTypeLabel(billType);
  switch (entryType) {
    case 'due':
      return `${bt} bill raised`;
    case 'advance_payment':
      return `Advance deposited — ${bt}`;
    case 'advance_applied':
      return `Advance applied — ${bt}`;
    case 'due_payment':
      return `${bt} paid`;
    case 'reversal':
      return `${bt} payment reversed`;
    default:
      return bt;
  }
}

function effectiveDelta(e: {
  direction: string;
  amount: number;
  payment_status?: string;
  refunded_amount?: number;
}): number {
  if (e.direction === 'debit') return -e.amount;
  if (e.payment_status === 'reversed') return 0;
  if (e.payment_status === 'partial_refund' && e.refunded_amount) {
    return e.amount - e.refunded_amount;
  }
  return e.amount;
}

export const GET = enhanceRouteHandler(
  async function ({ request, user }) {
    const client = getSupabaseServerClient();
    const admin = getSupabaseServerAdminClient();

    const { searchParams } = new URL(request.url);
    const accountSlug = searchParams.get('account') ?? '';
    const reqUnitId = searchParams.get('unit_id') ?? '';
    const reqFy = searchParams.get('fy') ?? currentFY();
    const reqType = searchParams.get('type') ?? '';
    const reqFrom = searchParams.get('from') ?? '';
    const reqTo = searchParams.get('to') ?? '';

    // Resolve account → association in a single query via embedded join.
    const { data: association } = await client
      .from('associations')
      .select(
        'id, address, gstin, pan_number, registration_number, email, phone, bank_account_name, bank_account_number, bank_name, bank_ifsc, bank_branch, accounts!inner(slug, name, picture_url)',
      )
      .eq('accounts.slug', accountSlug)
      .maybeSingle();

    if (!association) {
      return NextResponse.json(
        { error: 'Association not found.' },
        { status: 404 },
      );
    }

    // Resolve accessible units (same logic as statement page).
    const [{ data: ownedUnits }, { data: tenancies }] = await Promise.all([
      client
        .from('units')
        .select('id, unit_no')
        .eq('association_id', association.id)
        .eq('owner_id', user.id)
        .order('unit_no'),
      client
        .from('tenancies')
        .select('id, unit_id, units!inner(id, unit_no, association_id)')
        .eq('tenant_id', user.id)
        .eq('status', 'active')
        .eq('units.association_id', association.id),
    ]);

    const ownedUnitList = (ownedUnits ?? []) as {
      id: string;
      unit_no: string;
    }[];
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
      return NextResponse.json({ error: 'No units found.' }, { status: 404 });
    }

    const activeUnit = allUnits.find((u) => u.id === reqUnitId) ?? allUnits[0]!;
    const unitIds = [activeUnit.id];
    const unitNoMap = new Map([[activeUnit.id, activeUnit.unit_no]]);

    // Fetch bills + cash ledger in parallel (independent queries)
    const [{ data: billRows }, { data: advanceRows }] = await Promise.all([
      client
        .from('bills')
        .select(
          'id, unit_id, bill_type, bill_no, total_amount, generated_at, bill_line_items(description), payments(id, amount, mode, reference_no, paid_at, status, reversed_at, refunded_amount)',
        )
        .in('unit_id', unitIds)
        .eq('association_id', association.id)
        .neq('status', 'Void')
        .order('generated_at', { ascending: true }),
      // cash_ledger is a DB view not in generated types — cast required.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any)
        .from('cash_ledger')
        .select(
          'id, unit_id, entry_type, bill_type, amount, direction, entry_date, notes, reference_bill_id',
        )
        .in('unit_id', unitIds)
        .eq('association_id', association.id)
        .in('entry_type', [
          'due',
          'advance_payment',
          'advance_applied',
          'due_payment',
        ])
        .order('entry_date', { ascending: true })
        .order('created_at', { ascending: true }),
    ]);

    const advanceAppliedByBillId = new Map<string, number>();
    for (const e of (advanceRows ?? []) as {
      entry_type: string;
      reference_bill_id: string | null;
      amount: number;
    }[]) {
      if (e.entry_type === 'advance_applied' && e.reference_bill_id) {
        advanceAppliedByBillId.set(
          e.reference_bill_id,
          (advanceAppliedByBillId.get(e.reference_bill_id) ?? 0) +
            Number(e.amount),
        );
      }
    }

    type RawEntry = {
      id: string;
      unit_id: string;
      unit_no: string;
      entry_type: string;
      bill_type: string;
      bill_no: string | null;
      charge_name: string | null;
      amount: number;
      direction: string;
      entry_date: string;
      notes: string | null;
      mode: string | null;
      payment_status?: string;
      refunded_amount?: number;
    };

    const raw: RawEntry[] = [];

    for (const bill of billRows ?? []) {
      const unitNo = unitNoMap.get(bill.unit_id) ?? '?';
      const billType = (bill.bill_type as string) ?? 'other_charges';
      const lineItems =
        (bill.bill_line_items as { description: string }[]) ?? [];
      const primaryDescriptions = lineItems
        .map((li) => li.description)
        .filter((d) => !/gst|tax/i.test(d));
      const uniqueDescriptions = [...new Set(primaryDescriptions)];
      const charge_name =
        billType === 'other_charges' && uniqueDescriptions.length > 0
          ? uniqueDescriptions.join(', ')
          : null;

      const totalAdvanceApplied = advanceAppliedByBillId.get(bill.id) ?? 0;
      const billDebitAmount = Number(bill.total_amount) - totalAdvanceApplied;
      if (billDebitAmount > 0) {
        raw.push({
          id: `bill-${bill.id}`,
          unit_id: bill.unit_id,
          unit_no: unitNo,
          entry_type: 'due',
          bill_type: billType,
          bill_no: bill.bill_no,
          charge_name,
          amount: billDebitAmount,
          direction: 'debit',
          entry_date: (bill.generated_at as string).slice(0, 10),
          notes: null,
          mode: null,
        });
      }

      for (const p of (bill.payments as unknown as {
        id: string;
        amount: number;
        mode: string;
        reference_no: string | null;
        paid_at: string;
        status: string;
        reversed_at: string | null;
        refunded_amount: number | null;
      }[]) ?? []) {
        const refunded = Number(p.refunded_amount ?? 0);
        const isPartialRefund = p.status === 'active' && refunded > 0;
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
          payment_status: isPartialRefund ? 'partial_refund' : p.status,
          ...(isPartialRefund ? { refunded_amount: refunded } : {}),
        });
      }
    }

    for (const e of (advanceRows as RawEntry[]) ?? []) {
      raw.push({
        id: `ledger-${e.id}`,
        unit_id: e.unit_id,
        unit_no: unitNoMap.get(e.unit_id) ?? '?',
        entry_type: e.entry_type,
        bill_type: e.bill_type,
        bill_no: null,
        charge_name: null,
        amount: Number(e.amount),
        direction: e.direction,
        entry_date: e.entry_date,
        notes: e.notes,
        mode: null,
      });
    }

    raw.sort((a, b) => {
      if (a.entry_date !== b.entry_date)
        return a.entry_date < b.entry_date ? -1 : 1;
      if (a.direction !== b.direction) return a.direction === 'debit' ? -1 : 1;
      return 0;
    });

    // Apply date range filter — FY range takes precedence; custom from/to used when fy=__all__
    const fyRangeResult = reqFy !== FY_ALL ? fyRange(reqFy) : null;
    const range: { from: string; to: string } | null =
      fyRangeResult ??
      (reqFrom || reqTo
        ? { from: reqFrom || '0000-01-01', to: reqTo || '9999-12-31' }
        : null);
    const filtered = range
      ? raw.filter(
          (e) => e.entry_date >= range.from && e.entry_date <= range.to,
        )
      : raw;

    // Apply bill type filter
    const typeFiltered =
      reqType && reqType !== '__all__'
        ? filtered.filter((e) => e.bill_type === reqType)
        : filtered;

    // Compute opening balance (sum of all entries BEFORE the filtered range)
    let openingBalance = 0;
    if (range) {
      for (const e of raw) {
        if (e.entry_date < range.from) {
          openingBalance += effectiveDelta(e);
        }
      }
    }

    // Compute running balances
    let bal = openingBalance;
    const entries = typeFiltered.map((e) => {
      bal += effectiveDelta(e);
      return {
        date: e.entry_date,
        description: entryDescription(e.entry_type, e.bill_type, e.charge_name),
        subtext: e.bill_no ?? e.notes ?? null,
        debit: e.direction === 'debit' ? e.amount : 0,
        credit: e.direction === 'credit' ? Math.max(0, effectiveDelta(e)) : 0,
        runningBalance: bal,
      };
    });

    const closingBalance =
      entries[entries.length - 1]?.runningBalance ?? openingBalance;
    const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
    const totalCredit = entries.reduce((s, e) => s + e.credit, 0);

    const periodLabel =
      reqFy !== FY_ALL
        ? `FY ${reqFy}`
        : reqFrom || reqTo
          ? reqFrom && reqTo
            ? `${reqFrom} to ${reqTo}`
            : reqFrom
              ? `From ${reqFrom}`
              : `Until ${reqTo}`
          : 'All time';

    type AssocData = {
      id: string;
      address: string | null;
      gstin: string | null;
      pan_number: string | null;
      registration_number: string | null;
      email: string | null;
      phone: string | null;
      bank_account_name: string | null;
      bank_account_number: string | null;
      bank_name: string | null;
      bank_ifsc: string | null;
      bank_branch: string | null;
      accounts: { name: string; picture_url: string | null } | null;
    };
    const assocData = association as unknown as AssocData;

    // Fetch association logo URL (signed if stored in Supabase storage)
    let logoUrl: string | null = assocData.accounts?.picture_url ?? null;
    if (logoUrl?.startsWith('association-logos/')) {
      const { data: signed } = await admin.storage
        .from('avatars')
        .createSignedUrl(logoUrl, 300);
      logoUrl = signed?.signedUrl ?? null;
    }

    let bytes: Buffer;
    try {
      bytes = await renderStatementPdf({
        association: {
          name: assocData.accounts?.name ?? 'Association',
          address: assocData.address,
          gstin: assocData.gstin,
          panNumber: assocData.pan_number ?? null,
          registrationNumber: assocData.registration_number ?? null,
          logoUrl,
          email: assocData.email ?? null,
          phone: assocData.phone ?? null,
          bankAccountName: assocData.bank_account_name ?? null,
          bankAccountNumber: assocData.bank_account_number ?? null,
          bankName: assocData.bank_name ?? null,
          bankIfsc: assocData.bank_ifsc ?? null,
          bankBranch: assocData.bank_branch ?? null,
        },
        unit: { unitNo: activeUnit.unit_no },
        period: periodLabel,
        openingBalance,
        closingBalance,
        totalDebit,
        totalCredit,
        entries: entries.reverse(), // newest first
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      const logger = await getLogger();
      logger.error({ error: err }, 'Statement PDF render failed');
      return NextResponse.json(
        { error: 'Could not generate statement PDF.' },
        { status: 500 },
      );
    }

    const filenameSuffix =
      reqFy !== FY_ALL
        ? reqFy
        : reqFrom || reqTo
          ? `${reqFrom || 'start'}-to-${reqTo || 'end'}`
          : 'all-time';
    const filename = `statement-${activeUnit.unit_no}-${filenameSuffix}.pdf`;

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  },
  { auth: true },
);
