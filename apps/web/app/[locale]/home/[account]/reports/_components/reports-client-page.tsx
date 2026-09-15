'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useSearchParams } from 'next/navigation';

import { useSupabase } from '@kit/supabase/hooks/use-supabase';

import type { StatementEntry } from '../../statement/_lib/statement-types';
import {
  fetchDirectoryAction,
  fetchLedgerStatementAction,
  fetchOccupancyAction,
} from '../_lib/reports-actions';
import {
  type AdvanceRow,
  type CashLedgerRow,
  type CollectionRow,
  DEFAULT_FILTERS,
  type DirectoryRow,
  LEDGER_ALL_UNITS,
  type GstSummaryRow,
  type MescomRow,
  type OccupancyRow,
  type OtherChargeRow,
  type OutstandingBill,
  type PaymentModeRow,
  type PaymentRow,
  type PresetKey,
  type ReportsFilters,
  type TabKey,
  type UnitConsumptionRow,
  type UnitOption,
  type UnitOutstandingRow,
  dateToPeriod,
  resolvePreset,
} from '../_lib/reports-types';
import { DateRangePicker } from './date-range-picker';
import type { LedgerView } from './ledger-statement-tab';
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
  unit_outstanding: { rows: UnitOutstandingRow[] } | null;
  payment_modes: { rows: PaymentModeRow[] } | null;
  advances: { rows: AdvanceRow[] } | null;
  gst_summary: { rows: GstSummaryRow[] } | null;
  ledger_statement: { rows: StatementEntry[]; unitId: string } | null;
  occupancy: { rows: OccupancyRow[] } | null;
  directory: { rows: DirectoryRow[] } | null;
  other_charges: { rows: OtherChargeRow[] } | null;
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

function serializeIds(ids: string[]): string {
  return ids.join(',');
}
function parseIds(s: string | null): string[] {
  if (!s) return [];
  return s.split(',').filter(Boolean);
}

const TAB_FILTER_SUPPORT: Record<
  string,
  ('units' | 'bill_types' | 'status' | 'mode')[]
> = {
  collection: ['units', 'bill_types'],
  outstanding: ['units', 'bill_types', 'status'],
  payments: ['units', 'bill_types', 'mode'],
  cash_ledger: ['units', 'bill_types'],
  electricity: [],
  unit_outstanding: ['units'],
  payment_modes: [],
  advances: [],
  gst_summary: ['bill_types'],
  ledger_statement: [],
  occupancy: [],
  directory: [],
  other_charges: ['units'],
};

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
    unit_outstanding: null,
    payment_modes: null,
    advances: null,
    gst_summary: null,
    ledger_statement: null,
    occupancy: null,
    directory: null,
    other_charges: null,
  });

  // Occupancy & Directory local filters (don't trigger refetch, filter client-side)
  const [occupancyStatusFilter, setOccupancyStatusFilter] = useState<
    'all' | 'occupied' | 'vacant'
  >('all');
  const [directoryRoleFilter, setDirectoryRoleFilter] = useState<
    'all' | 'Owner' | 'Tenant'
  >('all');
  // Ledger statement: unit drives a refetch; the debit/credit view is client-side.
  // Defaults to the association-wide view so the tab opens on an overall
  // perspective rather than an empty "pick a unit" prompt.
  const [ledgerStatementUnitId, setLedgerStatementUnitId] =
    useState<string>(LEDGER_ALL_UNITS);
  const [ledgerView, setLedgerView] = useState<LedgerView>('all');
  const [collectionView, setCollectionView] = useState<'received' | 'raised'>(
    'received',
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = useSupabase();
  const abortRef = useRef<AbortController | null>(null);

  // Invalidate all cached tab data when date range or filters change
  /**
   * Drop cached tab data.
   *
   * `scope: 'date'` keeps the tabs whose queries never reference the date range
   * (occupancy, directory, ledger statement) — re-fetching those on every preset
   * change was pure waste and made returning to them feel slow for no reason.
   */
  const invalidateAll = useCallback((scope: 'all' | 'date' = 'all') => {
    setTabData((prev) => ({
      collection: null,
      outstanding: null,
      payments: null,
      cash_ledger: null,
      electricity: null,
      unit_outstanding: null,
      payment_modes: null,
      advances: null,
      gst_summary: null,
      ledger_statement: scope === 'date' ? prev.ledger_statement : null,
      occupancy: scope === 'date' ? prev.occupancy : null,
      directory: scope === 'date' ? prev.directory : null,
      other_charges: null,
    }));
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
                  'period, consumed_units, previous_reading, current_reading, minimum_charge, sub_meters(meter_type, unit_id, units(unit_no))',
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
                const minCharge = Number(r.minimum_charge ?? 0);
                // Include rows with either consumption or a minimum charge
                if (consumedUnits <= 0 && minCharge <= 0) continue;
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
                  minimum_charge: minCharge,
                });
              }
            }
          }

          setTabData((prev) => ({
            ...prev,
            electricity: { mescomRows, consumptionByPeriod },
          }));
        } else if (tab === 'unit_outstanding') {
          // Aggregated in Postgres. This previously pulled every bill and every
          // payment for the association to the browser just to derive one total
          // and one date per unit.
          const { data, error: rpcError } = await (supabase as any).rpc(
            'get_unit_outstanding_summary',
            { p_association_id: associationId },
          );
          if (ctrl.signal.aborted) return;
          if (rpcError) throw new Error(rpcError.message);

          const rows: UnitOutstandingRow[] = ((data ?? []) as any[]).map(
            (r) => ({
              unit_id: r.unit_id,
              unit_no: r.unit_no,
              total_outstanding: Number(r.total_outstanding),
              overdue_count: Number(r.overdue_count),
              last_payment_date: r.last_payment_date,
              owner_name: r.owner_name,
              owner_phone: r.owner_phone,
            }),
          );

          setTabData((prev) => ({ ...prev, unit_outstanding: { rows } }));
        } else if (tab === 'payment_modes') {
          // Aggregate payments by mode from both Razorpay and cash ledger
          let rpQ = (supabase as any)
            .from('payments')
            .select('amount, mode')
            .eq('association_id', associationId);
          if (!allTime && fromDate && toEndOfDay) {
            rpQ = rpQ.gte('paid_at', fromDate).lte('paid_at', toEndOfDay);
          }

          let clQ = supabase
            .from('cash_ledger_payments')
            .select('amount, mode')
            .eq('association_id', associationId)
            .eq('status', 'active');
          if (!allTime && fromDate && toEndOfDay) {
            clQ = (clQ as any)
              .gte('paid_at', fromDate)
              .lte('paid_at', toEndOfDay);
          }

          const [rpRes, clRes] = await Promise.all([rpQ, clQ]);
          if (ctrl.signal.aborted) return;
          if (rpRes.error) throw new Error(rpRes.error.message);
          if (clRes.error) throw new Error(clRes.error.message);

          const modeMap = new Map<string, { amount: number; count: number }>();
          for (const p of [
            ...(rpRes.data ?? []),
            ...(clRes.data ?? []),
          ] as any[]) {
            const mode = p.mode ?? 'Unknown';
            const cur = modeMap.get(mode) ?? { amount: 0, count: 0 };
            cur.amount += Number(p.amount);
            cur.count += 1;
            modeMap.set(mode, cur);
          }

          const rows: PaymentModeRow[] = Array.from(modeMap.entries())
            .map(([mode, v]) => ({ mode, amount: v.amount, count: v.count }))
            .sort((a, b) => b.amount - a.amount);

          setTabData((prev) => ({ ...prev, payment_modes: { rows } }));
        } else if (tab === 'advances') {
          // Fetch cash_ledger entries for advances, aggregate per unit
          const [balRes, depositRes, appliedRes, unitsRes] = await Promise.all([
            (supabase as any).rpc('get_association_cash_ledger_balances', {
              p_association_id: associationId,
            }),
            // Last advance_payment credit per unit
            supabase
              .from('cash_ledger')
              .select('unit_id, entry_date')
              .eq('association_id', associationId)
              .eq('entry_type', 'advance_payment')
              .eq('direction', 'credit')
              .order('entry_date', { ascending: false }),
            // Last advance_applied debit per unit
            supabase
              .from('cash_ledger')
              .select('unit_id, entry_date')
              .eq('association_id', associationId)
              .eq('entry_type', 'advance_applied')
              .eq('direction', 'debit')
              .order('entry_date', { ascending: false }),
            supabase
              .from('units')
              .select('id, unit_no')
              .eq('association_id', associationId),
          ]);
          if (ctrl.signal.aborted) return;
          if (balRes.error) throw new Error(balRes.error.message);

          const unitNoMap = new Map<string, string>(
            ((unitsRes.data ?? []) as any[]).map((u: any) => [u.id, u.unit_no]),
          );

          // Aggregate balance per unit (sum across bill types)
          const balanceMap = new Map<string, number>();
          for (const r of (balRes.data ?? []) as any[]) {
            const cur = balanceMap.get(r.unit_id) ?? 0;
            balanceMap.set(r.unit_id, cur + Number(r.balance));
          }

          const lastDepositMap = new Map<string, string>();
          for (const r of (depositRes.data ?? []) as any[]) {
            if (!lastDepositMap.has(r.unit_id))
              lastDepositMap.set(r.unit_id, r.entry_date);
          }

          const lastAppliedMap = new Map<string, string>();
          for (const r of (appliedRes.data ?? []) as any[]) {
            if (!lastAppliedMap.has(r.unit_id))
              lastAppliedMap.set(r.unit_id, r.entry_date);
          }

          // Show all units that ever had a deposit (balance may be 0)
          const allUnitIds = new Set([
            ...balanceMap.keys(),
            ...lastDepositMap.keys(),
          ]);

          const rows: AdvanceRow[] = Array.from(allUnitIds)
            .map((uid) => ({
              unit_id: uid,
              unit_no: unitNoMap.get(uid) ?? '—',
              balance: balanceMap.get(uid) ?? 0,
              last_deposit_date: lastDepositMap.get(uid) ?? null,
              last_applied_date: lastAppliedMap.get(uid) ?? null,
            }))
            .sort((a, b) => b.balance - a.balance);

          setTabData((prev) => ({ ...prev, advances: { rows } }));
        } else if (tab === 'gst_summary') {
          const gstTypeFilter = f.billTypes.length > 0 ? f.billTypes : null;
          let q = (supabase as any)
            .from('bills')
            .select(
              'period, bill_type, total_amount, paid_amount, advance_applied, gst_amount, status',
            )
            .eq('association_id', associationId)
            .neq('status', 'Reversed')
            .neq('status', 'Void')
            .not('gst_amount', 'is', null)
            .gt('gst_amount', 0);
          if (fromPeriod) q = q.gte('period', fromPeriod);
          if (toPeriod) q = q.lte('period', toPeriod);
          if (gstTypeFilter) q = q.in('bill_type', gstTypeFilter);

          const { data: gstBills, error: gstError } = await q;
          if (gstError) throw new Error(gstError.message);

          // Aggregate by period + bill_type
          const map = new Map<
            string,
            {
              bill_count: number;
              taxable_amount: number;
              gst_amount: number;
              total_amount: number;
              collected_total: number;
            }
          >();
          for (const b of (gstBills ?? []) as any[]) {
            const key = `${b.period}||${b.bill_type}`;
            const gst = Number(b.gst_amount ?? 0);
            const total = Number(b.total_amount ?? 0);
            const taxable = total - gst;
            const collected = Math.min(
              total,
              Number(b.paid_amount ?? 0) + Number(b.advance_applied ?? 0),
            );
            const cur = map.get(key) ?? {
              bill_count: 0,
              taxable_amount: 0,
              gst_amount: 0,
              total_amount: 0,
              collected_total: 0,
            };
            cur.bill_count += 1;
            cur.taxable_amount += taxable;
            cur.gst_amount += gst;
            cur.total_amount += total;
            cur.collected_total += collected;
            map.set(key, cur);
          }

          const gstRows: GstSummaryRow[] = Array.from(map.entries())
            .map(([key, v]) => {
              const [period = '', bill_type = ''] = key.split('||');
              // Estimate collected GST proportionally: collected_gst = collected * (gst / total)
              const gstRatio =
                v.total_amount > 0 ? v.gst_amount / v.total_amount : 0;
              const collected_gst = v.collected_total * gstRatio;
              const collected_taxable = v.collected_total - collected_gst;
              return {
                period,
                bill_type,
                bill_count: v.bill_count,
                taxable_amount: v.taxable_amount,
                gst_amount: v.gst_amount,
                total_amount: v.total_amount,
                collected_total: v.collected_total,
                collected_taxable,
                collected_gst,
              };
            })
            .sort(
              (a, b) =>
                b.period.localeCompare(a.period) ||
                a.bill_type.localeCompare(b.bill_type),
            );

          if (!ctrl.signal.aborted) {
            setTabData((prev) => ({ ...prev, gst_summary: { rows: gstRows } }));
          }
        } else if (tab === 'ledger_statement') {
          // No unit picked yet — nothing to fetch, and an empty result is the
          // correct state (the tab renders a "select a unit" prompt).
          if (!ledgerStatementUnitId) {
            if (!ctrl.signal.aborted) {
              setTabData((prev) => ({
                ...prev,
                ledger_statement: { rows: [], unitId: '' },
              }));
            }
          } else {
            const res = await fetchLedgerStatementAction(
              associationId,
              ledgerStatementUnitId,
            );
            if (!ctrl.signal.aborted) {
              if (res.success) {
                setTabData((prev) => ({
                  ...prev,
                  ledger_statement: {
                    rows: res.rows,
                    unitId: ledgerStatementUnitId,
                  },
                }));
              } else {
                setError(res.error);
              }
            }
          }
        } else if (tab === 'occupancy') {
          const res = await fetchOccupancyAction(associationId);
          if (!ctrl.signal.aborted) {
            if (res.success) {
              setTabData((prev) => ({
                ...prev,
                occupancy: { rows: res.rows },
              }));
            } else {
              setError(res.error);
            }
          }
        } else if (tab === 'directory') {
          const res = await fetchDirectoryAction(associationId);
          if (!ctrl.signal.aborted) {
            if (res.success) {
              setTabData((prev) => ({
                ...prev,
                directory: { rows: res.rows },
              }));
            } else {
              setError(res.error);
            }
          }
        } else if (tab === 'other_charges') {
          // Fetch all other_charges bills with their line items and aggregate
          // by charge name (bill_line_items.description).
          let q = (supabase as any)
            .from('bills')
            .select(
              'id, unit_id, total_amount, paid_amount, advance_applied, status, due_date, period, bill_line_items(description, amount)',
            )
            .eq('association_id', associationId)
            .eq('bill_type', 'other_charges')
            .neq('status', 'Reversed')
            .neq('status', 'Void')
            .order('period', { ascending: false });
          if (!allTime) {
            if (fromPeriod) q = q.gte('period', fromPeriod);
            if (toPeriod) q = q.lte('period', toPeriod);
          }
          if (f.unitIds.length > 0) q = q.in('unit_id', f.unitIds);

          const { data: ocData, error: ocErr } = await q;
          if (ctrl.signal.aborted) return;
          if (ocErr) throw new Error(ocErr.message);

          const today = new Date();
          today.setHours(0, 0, 0, 0);

          // Pro-rata: distribute paid_amount + advance_applied across line items
          // proportional to each item's share of total_amount.
          type ChargeAgg = {
            bill_ids: Set<string>;
            unit_ids: Set<string>;
            billed: number;
            collected: number;
          };
          const chargeMap = new Map<string, ChargeAgg>();

          for (const bill of ocData ?? []) {
            const lineItems: { description: string; amount: number }[] =
              bill.bill_line_items ?? [];
            const billTotal = Number(bill.total_amount) || 0;
            const billPaid =
              Number(bill.paid_amount) + Number(bill.advance_applied);

            for (const item of lineItems) {
              const name = item.description?.trim() || 'Other';
              const itemAmount = Number(item.amount);
              const fraction = billTotal > 0 ? itemAmount / billTotal : 0;
              const itemCollected = Math.min(
                itemAmount,
                Math.round(billPaid * fraction * 100) / 100,
              );

              const agg = chargeMap.get(name) ?? {
                bill_ids: new Set(),
                unit_ids: new Set(),
                billed: 0,
                collected: 0,
              };
              agg.bill_ids.add(bill.id);
              agg.unit_ids.add(bill.unit_id);
              agg.billed += itemAmount;
              agg.collected += itemCollected;
              chargeMap.set(name, agg);
            }
          }

          const rows: OtherChargeRow[] = Array.from(chargeMap.entries())
            .map(([charge_name, agg]) => ({
              charge_name,
              bill_count: agg.bill_ids.size,
              unit_count: agg.unit_ids.size,
              billed: agg.billed,
              collected: agg.collected,
              outstanding: Math.max(0, agg.billed - agg.collected),
            }))
            .sort((a, b) => b.billed - a.billed);

          if (!ctrl.signal.aborted) {
            setTabData((prev) => ({ ...prev, other_charges: { rows } }));
          }
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
    [supabase, associationId, ledgerStatementUnitId],
  );

  // Fetch current tab whenever it becomes null (after invalidation) or on first load.
  // Depends on the ACTIVE tab's slice, not the whole tabData object — the object
  // identity changes on every tab's write, which re-ran this effect needlessly.
  const activeTabData = tabData[activeTab as keyof TabData];
  useEffect(() => {
    if (activeTabData !== null) {
      setLoading(false);
      return;
    }
    fetchTab(activeTab, from, to, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, activeTabData]);

  // Re-fetch the ledger statement when the selected unit changes
  useEffect(() => {
    if (activeTab !== 'ledger_statement') return;
    setTabData((prev) => ({ ...prev, ledger_statement: null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerStatementUnitId]);

  // ── Filter/date handlers ──────────────────────────────────────────────────

  const applyPreset = useCallback(
    (key: PresetKey) => {
      const range = resolvePreset(key);
      setPreset(key);
      setFrom(range.from);
      setTo(range.to);
      invalidateAll('date');
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
      invalidateAll('date');
      syncUrl({ preset: 'custom', from: customFrom, to: customTo });
    },
    [invalidateAll],
  );

  const handleTabChange = useCallback((tab: TabKey) => {
    setActiveTab(tab);
    const supports = TAB_FILTER_SUPPORT[tab] ?? [];
    const removeParams: string[] = [];
    if (!supports.includes('bill_types')) removeParams.push('types');
    if (!supports.includes('status')) removeParams.push('status');
    if (!supports.includes('mode')) removeParams.push('mode');
    if (!supports.includes('units')) removeParams.push('units');
    setFilters((prev) => ({
      ...prev,
      unitIds: supports.includes('units') ? prev.unitIds : [],
      billTypes: supports.includes('bill_types') ? prev.billTypes : [],
      outstandingStatus: supports.includes('status')
        ? prev.outstandingStatus
        : 'all',
      paymentMode: supports.includes('mode') ? prev.paymentMode : '',
    }));
    syncUrl({ tab }, removeParams);
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
          next.unit_outstanding = null;
          next.payment_modes = null;
        }
        return next;
      });
    },
    [filters],
  );

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <p className="font-semibold">Could not load report data</p>
        <p className="text-muted-foreground text-sm">{error}</p>
        <button
          className="text-primary hover:text-primary/80 mt-2 text-sm underline transition-colors"
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
        onPreset={applyPreset}
        onCustom={applyCustom}
      />

      <ReportsTabs
        loading={loading || currentTabData === null}
        associationId={associationId}
        from={from}
        to={to}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        filters={{
          ...filters,
          collectedOnly:
            activeTab === 'collection' && collectionView === 'received',
        }}
        onFiltersChange={handleFiltersChange}
        collectionView={collectionView}
        onCollectionViewChange={setCollectionView}
        units={units}
        collectionRows={tabData.collection?.collectionRows ?? []}
        outstandingBills={tabData.outstanding?.outstandingBills ?? []}
        payments={
          tabData.payments?.payments ?? tabData.collection?.payments ?? []
        }
        cashLedgerRows={tabData.cash_ledger?.cashLedgerRows ?? []}
        mescomRows={tabData.electricity?.mescomRows ?? []}
        consumptionByPeriod={tabData.electricity?.consumptionByPeriod ?? {}}
        unitOutstandingRows={tabData.unit_outstanding?.rows ?? []}
        paymentModeRows={tabData.payment_modes?.rows ?? []}
        advanceRows={tabData.advances?.rows ?? []}
        gstSummaryRows={tabData.gst_summary?.rows ?? []}
        ledgerStatementRows={
          // Only trust rows that belong to the currently picked unit, so a
          // stale in-flight response can never render under the wrong unit.
          tabData.ledger_statement?.unitId === ledgerStatementUnitId
            ? (tabData.ledger_statement?.rows ?? [])
            : []
        }
        ledgerStatementUnitId={ledgerStatementUnitId}
        onLedgerStatementUnitChange={setLedgerStatementUnitId}
        ledgerView={ledgerView}
        onLedgerViewChange={setLedgerView}
        otherChargeRows={tabData.other_charges?.rows ?? []}
        occupancyRows={tabData.occupancy?.rows ?? []}
        occupancyStatusFilter={occupancyStatusFilter}
        onOccupancyStatusFilterChange={setOccupancyStatusFilter}
        directoryRows={tabData.directory?.rows ?? []}
        directoryRoleFilter={directoryRoleFilter}
        onDirectoryRoleFilterChange={setDirectoryRoleFilter}
      />
    </div>
  );
}
