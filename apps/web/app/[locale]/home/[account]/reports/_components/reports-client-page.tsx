'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useSearchParams } from 'next/navigation';

import { useSupabase } from '@kit/supabase/hooks/use-supabase';

import {
  type CashLedgerRow,
  type CollectionRow,
  DEFAULT_FILTERS,
  type MescomRow,
  type OutstandingBill,
  type PaymentRow,
  type PresetKey,
  type ReportsFilters,
  type TabKey,
  type UnitConsumptionRow,
  type UnitOption,
  dateToPeriod,
  resolvePreset,
} from '../_lib/reports-types';
import { DateRangePicker } from './date-range-picker';
import { ReportsTabs } from './reports-tabs';

interface Props {
  account: string;
  associationId: string;
  units: UnitOption[];
}

interface TabData {
  collection: {
    collectionRows: CollectionRow[];
    payments: PaymentRow[];
  } | null;
  outstanding: { outstandingBills: OutstandingBill[] } | null;
  payments: { payments: PaymentRow[] } | null;
  cash_ledger: { cashLedgerRows: CashLedgerRow[] } | null;
  electricity: {
    mescomRows: MescomRow[];
    consumptionByPeriod: Record<string, UnitConsumptionRow[]>;
  } | null;
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

/**
 * Format a rupee amount for the header summary. Only switches to the lakh
 * shorthand once the value is actually of that magnitude — filtering down to a
 * single unit otherwise rendered real amounts as a meaningless "₹0.0L".
 */
function formatAmount(n: number): string {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function serializeIds(ids: string[]): string {
  return ids.join(',');
}
function parseIds(s: string | null): string[] {
  if (!s) return [];
  return s.split(',').filter(Boolean);
}

export function ReportsClientPage({
  account: _account,
  associationId,
  units,
}: Props) {
  const searchParams = useSearchParams();

  const initPreset = searchParams.get('preset') ?? DEFAULT_PRESET;
  const initResolved = resolvePreset(initPreset);

  const [preset, setPreset] = useState(initPreset);
  const [from, setFrom] = useState(
    searchParams.get('from') ?? initResolved.from,
  );
  const [to, setTo] = useState(searchParams.get('to') ?? initResolved.to);
  const [activeTab, setActiveTab] = useState<TabKey>(
    (searchParams.get('tab') as TabKey | null) ?? 'collection',
  );

  // Filter state — all dimensions
  const [filters, setFilters] = useState<ReportsFilters>({
    unitIds: parseIds(searchParams.get('units')),
    billTypes: parseIds(searchParams.get('types')),
    outstandingStatus:
      (searchParams.get('status') as ReportsFilters['outstandingStatus']) ??
      DEFAULT_FILTERS.outstandingStatus,
    paymentMode: searchParams.get('mode') ?? DEFAULT_FILTERS.paymentMode,
  });

  // Per-tab data cache — null means "not yet fetched for current filter+date"
  const [tabData, setTabData] = useState<TabData>({
    collection: null,
    outstanding: null,
    payments: null,
    cash_ledger: null,
    electricity: null,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = useSupabase();
  const abortRef = useRef<AbortController | null>(null);

  // Invalidate all cached tab data when date range or filters change
  const invalidateAll = useCallback(() => {
    setTabData({
      collection: null,
      outstanding: null,
      payments: null,
      cash_ledger: null,
      electricity: null,
    });
  }, []);

  // ── Per-tab fetch ─────────────────────────────────────────────────────────

  const fetchTab = useCallback(
    async (
      tab: string,
      fromDate: string,
      toDate: string,
      f: ReportsFilters,
    ) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setLoading(true);
      setError(null);

      const allTime = !fromDate && !toDate;
      const fromPeriod = fromDate ? dateToPeriod(fromDate) : null;
      const toPeriod = toDate ? dateToPeriod(toDate) : null;
      const toEndOfDay = toDate ? `${toDate}T23:59:59.999` : null;
      const unitFilter = f.unitIds.length > 0 ? f.unitIds : null;
      const typeFilter = f.billTypes.length > 0 ? f.billTypes : null;

      try {
        if (tab === 'collection') {
          const rpcParams: Record<string, unknown> = {
            p_association_id: associationId,
          };
          if (fromPeriod) rpcParams['p_from_period'] = fromPeriod;
          if (toPeriod) rpcParams['p_to_period'] = toPeriod;
          if (unitFilter) rpcParams['p_unit_ids'] = unitFilter;
          if (typeFilter) rpcParams['p_bill_types'] = typeFilter;

          let paymentsQ = (supabase as any)
            .from('payments')
            .select(
              'id, amount, mode, reference_no, paid_at, bills(bill_no, bill_type, unit_id, units(unit_no)), receipts(receipt_no)',
            )
            .eq('association_id', associationId)
            .order('paid_at', { ascending: false });
          if (!allTime && fromDate && toEndOfDay) {
            paymentsQ = paymentsQ
              .gte('paid_at', fromDate)
              .lte('paid_at', toEndOfDay);
          }
          if (unitFilter)
            paymentsQ = paymentsQ.filter(
              'bills.unit_id',
              'in',
              `(${unitFilter.join(',')})`,
            );
          if (typeFilter) {
            // can't filter payments by bill_type directly — filter client-side after join
          }

          const [collectionRes, paymentsRes] = await Promise.all([
            (supabase as any).rpc('get_collection_summary', rpcParams),
            paymentsQ,
          ]);
          if (ctrl.signal.aborted) return;
          if (collectionRes.error) throw new Error(collectionRes.error.message);
          if (paymentsRes.error) throw new Error(paymentsRes.error.message);

          const collectionRows: CollectionRow[] = (
            (collectionRes.data as any[]) ?? []
          ).map((r: any) => ({
            period: r.period,
            bill_type: r.bill_type ?? 'maintenance',
            bill_count: Number(r.bill_count),
            billed: Number(r.billed),
            collected: Number(r.collected),
          }));

          const payments: PaymentRow[] = ((paymentsRes.data as any[]) ?? [])
            .map((p: any) => {
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
                  (receipt as { receipt_no: string } | null)?.receipt_no ??
                  null,
                source: 'razorpay' as const,
              };
            })
            .filter(
              (p) => !typeFilter || typeFilter.includes(p.bill_type as string),
            );

          setTabData((prev) => ({
            ...prev,
            collection: { collectionRows, payments },
          }));
        } else if (tab === 'outstanding') {
          let q = supabase
            .from('bills')
            .select(
              'id, period, bill_no, bill_type, total_amount, paid_amount, advance_applied, status, due_date, unit_id, units(unit_no)',
            )
            .eq('association_id', associationId)
            .neq('status', 'Paid')
            .neq('status', 'Reversed')
            .neq('status', 'Void')
            .order('due_date');
          if (!allTime) {
            if (fromPeriod) q = (q as any).gte('period', fromPeriod);
            if (toPeriod) q = (q as any).lte('period', toPeriod);
          }
          if (unitFilter) q = (q as any).in('unit_id', unitFilter);
          if (typeFilter) q = (q as any).in('bill_type', typeFilter);

          const { data, error: qErr } = await q;
          if (ctrl.signal.aborted) return;
          if (qErr) throw new Error(qErr.message);

          const outstandingBills: OutstandingBill[] = (data ?? []).map(
            (b: any) => ({
              id: b.id,
              period: b.period,
              bill_no: b.bill_no,
              bill_type: b.bill_type ?? 'maintenance',
              unit_no: (b.units as { unit_no: string } | null)?.unit_no ?? '—',
              total_amount: Number(b.total_amount),
              paid_amount: Number(b.paid_amount),
              advance_applied: Number(b.advance_applied ?? 0),
              status: b.status,
              due_date: b.due_date,
            }),
          );

          setTabData((prev) => ({
            ...prev,
            outstanding: { outstandingBills },
          }));
        } else if (tab === 'payments') {
          // Fetch both Razorpay payments and cash_ledger_payments
          let rpQ = (supabase as any)
            .from('payments')
            .select(
              'id, amount, mode, reference_no, paid_at, bills(bill_no, bill_type, unit_id, units(unit_no)), receipts(receipt_no)',
            )
            .eq('association_id', associationId)
            .order('paid_at', { ascending: false });
          if (!allTime && fromDate && toEndOfDay) {
            rpQ = rpQ.gte('paid_at', fromDate).lte('paid_at', toEndOfDay);
          }
          if (unitFilter)
            rpQ = rpQ.filter(
              'bills.unit_id',
              'in',
              `(${unitFilter.join(',')})`,
            );
          if (f.paymentMode) rpQ = rpQ.eq('mode', f.paymentMode);

          let clQ = supabase
            .from('cash_ledger_payments')
            .select(
              'id, amount, mode, reference_no, paid_at, unit_id, bill_type, receipt_no, units(unit_no)',
            )
            .eq('association_id', associationId)
            .eq('status', 'active')
            .order('paid_at', { ascending: false });
          if (!allTime && fromDate && toEndOfDay) {
            clQ = (clQ as any)
              .gte('paid_at', fromDate)
              .lte('paid_at', toEndOfDay);
          }
          if (unitFilter) clQ = (clQ as any).in('unit_id', unitFilter);
          if (typeFilter) clQ = (clQ as any).in('bill_type', typeFilter);
          if (f.paymentMode) clQ = (clQ as any).eq('mode', f.paymentMode);

          const [rpRes, clRes] = await Promise.all([rpQ, clQ]);
          if (ctrl.signal.aborted) return;
          if (rpRes.error) throw new Error(rpRes.error.message);
          if (clRes.error) throw new Error(clRes.error.message);

          const rpRows: PaymentRow[] = ((rpRes.data as any[]) ?? [])
            .map((p: any) => {
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
                  (receipt as { receipt_no: string } | null)?.receipt_no ??
                  null,
                source: 'razorpay' as const,
              };
            })
            .filter((p) => !typeFilter || typeFilter.includes(p.bill_type));

          const clRows: PaymentRow[] = ((clRes.data as any[]) ?? []).map(
            (p: any) => {
              const unit = p.units as { unit_no: string } | null;
              return {
                id: p.id,
                paid_at: p.paid_at,
                unit_no: unit?.unit_no ?? '—',
                bill_no: '—',
                bill_type: p.bill_type ?? 'maintenance',
                amount: Number(p.amount),
                mode: p.mode,
                reference_no: p.reference_no ?? null,
                receipt_no: p.receipt_no ?? null,
                source: 'cash_ledger' as const,
              };
            },
          );

          // Merge and sort by paid_at desc
          const payments = [...rpRows, ...clRows].sort((a, b) =>
            b.paid_at.localeCompare(a.paid_at),
          );

          setTabData((prev) => ({ ...prev, payments: { payments } }));
        } else if (tab === 'cash_ledger') {
          let q = supabase
            .from('cash_ledger')
            .select(
              'id, entry_date, entry_type, bill_type, direction, amount, notes, paid_by_name, unit_id, units(unit_no)',
            )
            .eq('association_id', associationId)
            .order('entry_date', { ascending: false });
          if (!allTime && fromDate) q = (q as any).gte('entry_date', fromDate);
          if (!allTime && toDate) q = (q as any).lte('entry_date', toDate);
          if (unitFilter) q = (q as any).in('unit_id', unitFilter);
          if (typeFilter) q = (q as any).in('bill_type', typeFilter);

          const { data, error: qErr } = await q;
          if (ctrl.signal.aborted) return;
          if (qErr) throw new Error(qErr.message);

          const cashLedgerRows: CashLedgerRow[] = (data ?? []).map(
            (r: any) => ({
              id: r.id,
              entry_date: r.entry_date,
              unit_no: (r.units as { unit_no: string } | null)?.unit_no ?? '—',
              entry_type: r.entry_type,
              bill_type: r.bill_type,
              direction: r.direction,
              amount: Number(r.amount),
              notes: r.notes ?? null,
              paid_by_name: r.paid_by_name,
            }),
          );

          setTabData((prev) => ({ ...prev, cash_ledger: { cashLedgerRows } }));
        } else if (tab === 'electricity') {
          let q = supabase
            .from('mescom_bills')
            .select('id, period, invoice_amount, block_consumption_units')
            .eq('association_id', associationId)
            .order('period', { ascending: false });
          if (!allTime) {
            if (fromPeriod) q = (q as any).gte('period', fromPeriod);
            if (toPeriod) q = (q as any).lte('period', toPeriod);
          }

          const { data, error: qErr } = await q;
          if (ctrl.signal.aborted) return;
          if (qErr) throw new Error(qErr.message);

          const mescomRows: MescomRow[] = (data ?? []).map((m: any) => ({
            id: m.id,
            period: m.period,
            invoice_amount: Number(m.invoice_amount),
            block_consumption_units: Number(m.block_consumption_units),
            rate:
              m.block_consumption_units > 0
                ? Number(m.invoice_amount) / Number(m.block_consumption_units)
                : null,
          }));

          // Fetch unit-level meter readings and electricity bill charges
          let consumptionByPeriod: Record<string, UnitConsumptionRow[]> = {};
          const mescomBillIds = mescomRows.map((m) => m.id);
          if (mescomBillIds.length > 0) {
            const periods = mescomRows.map((m) => m.period);
            const [mrRes, elecBillsRes] = await Promise.all([
              (supabase as any)
                .from('meter_readings')
                .select(
                  'period, consumed_units, previous_reading, current_reading, sub_meters(meter_type, unit_id, units(unit_no))',
                )
                .in('mescom_bill_id', mescomBillIds),
              (supabase as any)
                .from('bills')
                .select('period, unit_id, total_amount')
                .eq('association_id', associationId)
                .eq('bill_type', 'electricity')
                .neq('status', 'Void')
                .in('period', periods),
            ]);

            if (!ctrl.signal.aborted && !mrRes.error && !elecBillsRes.error) {
              const chargeMap = new Map<string, number>();
              for (const b of (elecBillsRes.data ?? []) as any[]) {
                chargeMap.set(
                  `${b.unit_id}:${b.period}`,
                  Number(b.total_amount),
                );
              }

              for (const r of (mrRes.data ?? []) as any[]) {
                const sm = r.sub_meters as {
                  meter_type: string;
                  unit_id: string;
                  units: { unit_no: string } | null;
                } | null;
                if (!sm || sm.meter_type !== 'Unit' || !sm.units) continue;
                const consumedUnits = Number(r.consumed_units);
                if (consumedUnits <= 0) continue;
                const period = r.period as string;
                if (!consumptionByPeriod[period])
                  consumptionByPeriod[period] = [];
                consumptionByPeriod[period]!.push({
                  unit_no: sm.units.unit_no,
                  consumed_units: consumedUnits,
                  charged_amount: chargeMap.get(`${sm.unit_id}:${period}`) ?? 0,
                  prev_reading:
                    r.previous_reading !== null
                      ? Number(r.previous_reading)
                      : null,
                  curr_reading:
                    r.current_reading !== null
                      ? Number(r.current_reading)
                      : null,
                });
              }
            }
          }

          setTabData((prev) => ({
            ...prev,
            electricity: { mescomRows, consumptionByPeriod },
          }));
        }
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

  // Fetch current tab whenever it becomes null (after invalidation) or on first load
  useEffect(() => {
    const cached = tabData[activeTab];
    if (cached !== null) {
      setLoading(false);
      return;
    }
    fetchTab(activeTab, from, to, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, tabData]);

  // ── Filter/date handlers ──────────────────────────────────────────────────

  const applyPreset = useCallback(
    (key: PresetKey) => {
      const range = resolvePreset(key);
      setPreset(key);
      setFrom(range.from);
      setTo(range.to);
      invalidateAll();
      if (key === 'all_time') {
        syncUrl({ preset: key }, ['from', 'to']);
      } else {
        syncUrl({ preset: key, from: range.from, to: range.to });
      }
    },
    [invalidateAll],
  );

  const applyCustom = useCallback(
    (customFrom: string, customTo: string) => {
      setPreset('custom');
      setFrom(customFrom);
      setTo(customTo);
      invalidateAll();
      syncUrl({ preset: 'custom', from: customFrom, to: customTo });
    },
    [invalidateAll],
  );

  const handleTabChange = useCallback((tab: TabKey) => {
    setActiveTab(tab);
    syncUrl({ tab });
  }, []);

  const handleFiltersChange = useCallback(
    (patch: Partial<ReportsFilters>) => {
      const next = { ...filters, ...patch };
      setFilters(next);

      // Compute URL update from the already-known next state — no side effects
      // inside the setState updater.
      const urlPatch: Record<string, string> = {};
      const urlRemove: string[] = [];
      if (next.unitIds.length > 0)
        urlPatch['units'] = serializeIds(next.unitIds);
      else urlRemove.push('units');
      if (next.billTypes.length > 0)
        urlPatch['types'] = serializeIds(next.billTypes);
      else urlRemove.push('types');
      if (next.outstandingStatus !== 'all')
        urlPatch['status'] = next.outstandingStatus;
      else urlRemove.push('status');
      if (next.paymentMode) urlPatch['mode'] = next.paymentMode;
      else urlRemove.push('mode');
      syncUrl(urlPatch, urlRemove);

      // Invalidate only tabs affected by the changed filter dimensions
      const changedKeys = Object.keys(patch);
      setTabData((prev) => {
        const next = { ...prev };
        // date-range-independent status filter only affects outstanding client-side — no refetch
        // unit/billType changes affect: collection, outstanding, payments, cash_ledger
        if (
          changedKeys.some((k) =>
            ['unitIds', 'billTypes', 'paymentMode'].includes(k),
          )
        ) {
          next.collection = null;
          next.outstanding = null;
          next.payments = null;
          next.cash_ledger = null;
        }
        return next;
      });
    },
    [filters],
  );

  // ── Derived header summary ────────────────────────────────────────────────

  const collectionData = tabData.collection;
  const collectionRows = collectionData?.collectionRows ?? [];
  const totalBilled = collectionRows.reduce((s, r) => s + r.billed, 0);
  // Derive outstanding from the same filtered collection rows rather than the
  // Outstanding tab — that tab is lazily fetched, so reading it here reported
  // ₹0 outstanding until the user actually opened it.
  const totalOutstanding = collectionRows.reduce(
    (s, r) => s + (r.billed - r.collected),
    0,
  );

  const periodLabel =
    preset === 'all_time' ? 'all time' : 'the selected period';
  const headerSub = loading
    ? 'Loading…'
    : totalBilled > 0
      ? `${formatAmount(totalBilled)} billed · ${formatAmount(totalOutstanding)} outstanding`
      : `No data for ${periodLabel}`;

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <p className="font-semibold">Could not load report data</p>
        <p className="text-muted-foreground text-sm">{error}</p>
        <button
          className="text-primary mt-2 text-sm underline"
          onClick={() => {
            invalidateAll();
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  const currentTabData = tabData[activeTab];

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

      {loading || currentTabData === null ? (
        <ReportsSkeleton />
      ) : (
        <ReportsTabs
          associationId={associationId}
          from={from}
          to={to}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          filters={filters}
          onFiltersChange={handleFiltersChange}
          units={units}
          collectionRows={tabData.collection?.collectionRows ?? []}
          outstandingBills={tabData.outstanding?.outstandingBills ?? []}
          payments={
            tabData.payments?.payments ?? tabData.collection?.payments ?? []
          }
          cashLedgerRows={tabData.cash_ledger?.cashLedgerRows ?? []}
          mescomRows={tabData.electricity?.mescomRows ?? []}
          consumptionByPeriod={tabData.electricity?.consumptionByPeriod ?? {}}
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
