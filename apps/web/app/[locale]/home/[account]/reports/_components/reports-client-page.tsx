'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useSearchParams } from 'next/navigation';

import { useSupabase } from '@kit/supabase/hooks/use-supabase';

import {
  type CollectionRow,
  type MescomRow,
  type OutstandingBill,
  type PaymentRow,
  type PresetKey,
  type UnitConsumptionRow,
  dateToPeriod,
  resolvePreset,
} from '../_lib/reports-types';
import { DateRangePicker } from './date-range-picker';
import { ReportsTabs } from './reports-tabs';

interface Props {
  account: string;
  associationId: string;
}

interface ReportsData {
  collectionRows: CollectionRow[];
  outstandingBills: OutstandingBill[];
  payments: PaymentRow[];
  mescomRows: MescomRow[];
  consumptionByPeriod: Record<string, UnitConsumptionRow[]>;
}

const DEFAULT_PRESET: PresetKey = 'all_time';

/** Push URL without triggering a Next.js server round-trip. */
function syncUrl(params: Record<string, string>, remove?: string[]) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (const k of remove ?? []) url.searchParams.delete(k);
  window.history.replaceState(null, '', url.toString());
}

export function ReportsClientPage({ account: _account, associationId }: Props) {
  // ── Read URL search params once on initial render ─────────────────────────
  const searchParams = useSearchParams();
  const initPreset = searchParams.get('preset') ?? DEFAULT_PRESET;
  const initResolved = resolvePreset(initPreset);

  // ── ALL filter/tab state lives here — no router.push, no server round-trips ──
  const [preset, setPreset] = useState(initPreset);
  const [from, setFrom] = useState(
    searchParams.get('from') ?? initResolved.from,
  );
  const [to, setTo] = useState(searchParams.get('to') ?? initResolved.to);
  const [activeTab, setActiveTab] = useState(
    searchParams.get('tab') ?? 'collection',
  );

  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = useSupabase();
  const abortRef = useRef<AbortController | null>(null);

  // ── Data fetch — triggered only when from/to change ───────────────────────
  const fetchData = useCallback(
    async (fromDate: string, toDate: string) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setLoading(true);
      setError(null);

      // Empty strings mean "All Time" — skip period/date filters in that case
      const allTime = !fromDate && !toDate;
      const fromPeriod = fromDate ? dateToPeriod(fromDate) : null;
      const toPeriod = toDate ? dateToPeriod(toDate) : null;
      const toEndOfDay = toDate ? `${toDate}T23:59:59.999` : null;

      try {
        // Build queries conditionally — date filters are optional for All Time
        let billsQuery = supabase
          .from('bills')
          .select(
            'id, period, bill_no, bill_type, total_amount, paid_amount, status, due_date, units(unit_no)',
          )
          .eq('association_id', associationId)
          .neq('status', 'Paid')
          .order('due_date');
        if (!allTime) {
          billsQuery = (billsQuery as any)
            .gte('period', fromPeriod)
            .lte('period', toPeriod);
        }

        let paymentsQuery = (supabase as any)
          .from('payments')
          .select(
            'id, amount, mode, reference_no, paid_at, bills(bill_no, bill_type, units(unit_no)), receipts(receipt_no)',
          )
          .eq('association_id', associationId)
          .eq('status', 'active')
          .order('paid_at', { ascending: false });
        if (!allTime && fromDate && toEndOfDay) {
          paymentsQuery = paymentsQuery
            .gte('paid_at', fromDate)
            .lte('paid_at', toEndOfDay);
        }

        let mescomQuery = supabase
          .from('mescom_bills')
          .select('id, period, invoice_amount, block_consumption_units')
          .eq('association_id', associationId)
          .order('period', { ascending: false });
        if (!allTime) {
          mescomQuery = (mescomQuery as any)
            .gte('period', fromPeriod)
            .lte('period', toPeriod);
        }

        // Build RPC params: omit period keys entirely when null so Postgres
        // uses DEFAULT NULL (passing explicit null causes a 400 Bad Request).
        const rpcParams: Record<string, unknown> = {
          p_association_id: associationId,
        };
        if (fromPeriod) rpcParams['p_from_period'] = fromPeriod;
        if (toPeriod) rpcParams['p_to_period'] = toPeriod;

        const [collectionRes, outstandingRes, paymentsRes, mescomRes] =
          await Promise.all([
            (supabase as any).rpc('get_collection_summary', rpcParams),
            billsQuery,
            paymentsQuery,
            mescomQuery,
          ]);

        if (ctrl.signal.aborted) return;

        // Surface any query-level errors rather than silently showing empty data
        const queryError =
          collectionRes.error ??
          outstandingRes.error ??
          paymentsRes.error ??
          mescomRes.error;
        if (queryError) throw new Error((queryError as any).message ?? String(queryError));

        const collectionRows: CollectionRow[] = (
          (collectionRes.data as any[]) ?? []
        ).map((r: any) => ({
          period: r.period,
          bill_type: r.bill_type ?? 'maintenance',
          bill_count: Number(r.bill_count),
          billed: Number(r.billed),
          collected: Number(r.collected),
        }));

        const outstandingBills: OutstandingBill[] = (
          outstandingRes.data ?? []
        ).map((b: any) => ({
          id: b.id,
          period: b.period,
          bill_no: b.bill_no,
          bill_type: b.bill_type ?? 'maintenance',
          unit_no: (b.units as { unit_no: string } | null)?.unit_no ?? '—',
          total_amount: Number(b.total_amount),
          paid_amount: Number(b.paid_amount),
          status: b.status,
          due_date: b.due_date,
        }));

        const payments: PaymentRow[] = (paymentsRes.data ?? []).map(
          (p: any) => {
            const bill = p.bills as {
              bill_no: string;
              bill_type: string;
              units: { unit_no: string } | null;
            } | null;
            const receipt = Array.isArray(p.receipts)
              ? p.receipts[0]
              : p.receipts;
            return {
              id: p.id,
              paid_at: p.paid_at,
              unit_no: bill?.units?.unit_no ?? '—',
              bill_no: bill?.bill_no ?? '—',
              bill_type: bill?.bill_type ?? 'maintenance',
              amount: Number(p.amount),
              mode: p.mode,
              reference_no: p.reference_no ?? null,
              receipt_no:
                (receipt as { receipt_no: string } | null)?.receipt_no ?? null,
            };
          },
        );

        const mescomRows: MescomRow[] = (mescomRes.data ?? []).map(
          (m: any) => ({
            id: m.id,
            period: m.period,
            invoice_amount: Number(m.invoice_amount),
            block_consumption_units: Number(m.block_consumption_units),
            rate:
              m.block_consumption_units > 0
                ? Number(m.invoice_amount) / Number(m.block_consumption_units)
                : null,
          }),
        );

        setData({
          collectionRows,
          outstandingBills,
          payments,
          mescomRows,
          consumptionByPeriod: {},
        });
      } catch (err) {
        if (ctrl.signal.aborted) return;
        setError(
          err instanceof Error ? err.message : 'Failed to load report data.',
        );
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    },
    [supabase, associationId],
  );

  useEffect(() => {
    fetchData(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  // ── Filter handlers — pure state updates + URL sync, no server round-trip ──
  const applyPreset = useCallback((key: PresetKey) => {
    const range = resolvePreset(key);
    setPreset(key);
    setFrom(range.from);
    setTo(range.to);
    if (key === 'all_time') {
      syncUrl({ preset: key }, ['from', 'to']);
    } else {
      syncUrl({ preset: key, from: range.from, to: range.to });
    }
  }, []);

  const applyCustom = useCallback((customFrom: string, customTo: string) => {
    setPreset('custom');
    setFrom(customFrom);
    setTo(customTo);
    syncUrl({ preset: 'custom', from: customFrom, to: customTo });
  }, []);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    syncUrl({ tab });
  }, []);

  // ── Derived summary for sub-heading ───────────────────────────────────────
  const totalBilled =
    data?.collectionRows.reduce((s, r) => s + r.billed, 0) ?? 0;
  const totalOutstanding =
    data?.outstandingBills.reduce(
      (s, b) => s + b.total_amount - b.paid_amount,
      0,
    ) ?? 0;

  const periodLabel = preset === 'all_time' ? 'all time' : 'the selected period';
  const headerSub = loading
    ? 'Loading…'
    : data && (data.collectionRows.length > 0 || data.payments.length > 0)
      ? `₹${(totalBilled / 100000).toFixed(1)}L billed · ₹${(totalOutstanding / 100000).toFixed(1)}L outstanding`
      : `No data for ${periodLabel}`;

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <p className="font-semibold">Could not load report data</p>
        <p className="text-muted-foreground text-sm">{error}</p>
        <button
          className="text-primary mt-2 text-sm underline"
          onClick={() => fetchData(from, to)}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <DateRangePicker
        preset={preset}
        from={from}
        to={to}
        loading={loading}
        onPreset={applyPreset}
        onCustom={applyCustom}
      />

      <p className="text-muted-foreground -mt-3 text-xs">{headerSub}</p>

      {loading ? (
        <ReportsSkeleton />
      ) : (
        <ReportsTabs
          associationId={associationId}
          from={from}
          to={to}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          collectionRows={data?.collectionRows ?? []}
          outstandingBills={data?.outstandingBills ?? []}
          payments={data?.payments ?? []}
          mescomRows={data?.mescomRows ?? []}
          consumptionByPeriod={data?.consumptionByPeriod ?? {}}
        />
      )}
    </div>
  );
}

export function ReportsSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-muted h-24 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="bg-muted h-72 rounded-xl lg:col-span-2" />
        <div className="bg-muted h-72 rounded-xl" />
      </div>
    </div>
  );
}
