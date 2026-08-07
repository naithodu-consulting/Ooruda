'use client';

import dynamic from 'next/dynamic';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kit/ui/tabs';

import {
  type CashLedgerRow,
  type CollectionRow,
  type MescomRow,
  type OutstandingBill,
  type PaymentRow,
  type ReportsFilters,
  type TabKey,
  type UnitConsumptionRow,
  type UnitOption,
} from '../_lib/reports-types';
import { ExportButton } from './export-button';
import {
  ActiveFilterChips,
  BillTypeFilter,
  ModeFilter,
  StatusFilter,
  UnitFilter,
} from './filter-bar';

// Recharts is ~250 KB. Lazy-load each chart tab so it is excluded from the
// initial bundle and only fetched when the Reports route is visited.
const CollectionTab = dynamic(
  () => import('./collection-tab').then((m) => ({ default: m.CollectionTab })),
  {
    ssr: false,
    loading: () => <div className="bg-muted h-64 animate-pulse rounded-lg" />,
  },
);
const OutstandingTab = dynamic(
  () =>
    import('./outstanding-tab').then((m) => ({ default: m.OutstandingTab })),
  {
    ssr: false,
    loading: () => <div className="bg-muted h-64 animate-pulse rounded-lg" />,
  },
);
const PaymentsTab = dynamic(
  () => import('./payments-tab').then((m) => ({ default: m.PaymentsTab })),
  {
    ssr: false,
    loading: () => <div className="bg-muted h-64 animate-pulse rounded-lg" />,
  },
);
const CashLedgerTab = dynamic(
  () => import('./cash-ledger-tab').then((m) => ({ default: m.CashLedgerTab })),
  {
    ssr: false,
    loading: () => <div className="bg-muted h-64 animate-pulse rounded-lg" />,
  },
);
const ElectricityTab = dynamic(
  () =>
    import('./electricity-tab').then((m) => ({ default: m.ElectricityTab })),
  {
    ssr: false,
    loading: () => <div className="bg-muted h-64 animate-pulse rounded-lg" />,
  },
);

interface Props {
  associationId: string;
  from: string;
  to: string;
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  filters: ReportsFilters;
  onFiltersChange: (patch: Partial<ReportsFilters>) => void;
  units: UnitOption[];
  collectionRows: CollectionRow[];
  outstandingBills: OutstandingBill[];
  payments: PaymentRow[];
  cashLedgerRows: CashLedgerRow[];
  mescomRows: MescomRow[];
  consumptionByPeriod: Record<string, UnitConsumptionRow[]>;
}

const TABS = [
  { value: 'collection', label: 'Collection' },
  { value: 'outstanding', label: 'Outstanding' },
  { value: 'payments', label: 'Payments' },
  { value: 'cash_ledger', label: 'Cash Ledger' },
  { value: 'electricity', label: 'Electricity' },
];

// Which filter controls appear on each tab
const TAB_FILTERS: Record<
  string,
  ('units' | 'bill_types' | 'status' | 'mode')[]
> = {
  collection: ['units', 'bill_types'],
  outstanding: ['units', 'bill_types', 'status'],
  payments: ['units', 'bill_types', 'mode'],
  cash_ledger: ['units', 'bill_types'],
  electricity: [],
};

export function ReportsTabs({
  associationId,
  from,
  to,
  activeTab,
  onTabChange,
  filters,
  onFiltersChange,
  units,
  collectionRows,
  outstandingBills,
  payments,
  cashLedgerRows,
  mescomRows,
  consumptionByPeriod,
}: Props) {
  const tabFilters = TAB_FILTERS[activeTab] ?? [];
  const hasActiveFilters =
    filters.unitIds.length > 0 ||
    filters.billTypes.length > 0 ||
    filters.outstandingStatus !== 'all' ||
    !!filters.paymentMode;

  return (
    <Tabs value={activeTab} onValueChange={(tab) => onTabChange(tab as TabKey)}>
      {/* Header row: tabs + export */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="overflow-x-auto pb-0.5">
          <TabsList className="w-max">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <ExportButton
          associationId={associationId}
          from={from}
          to={to}
          activeTab={activeTab}
          filters={filters}
        />
      </div>

      {/* Per-tab filter bar */}
      {tabFilters.length > 0 && (
        <div className="bg-muted/40 mb-4 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
          {tabFilters.includes('units') && units.length > 0 && (
            <>
              <span className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
                Units
              </span>
              <UnitFilter
                units={units}
                selected={filters.unitIds}
                onChange={(ids) => onFiltersChange({ unitIds: ids })}
              />
            </>
          )}

          {tabFilters.includes('bill_types') && (
            <>
              <span className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
                Type
              </span>
              <BillTypeFilter
                selected={filters.billTypes}
                onChange={(types) => onFiltersChange({ billTypes: types })}
              />
            </>
          )}

          {tabFilters.includes('status') && (
            <>
              <span className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
                Status
              </span>
              <StatusFilter
                value={filters.outstandingStatus}
                onChange={(s) => onFiltersChange({ outstandingStatus: s })}
              />
            </>
          )}

          {tabFilters.includes('mode') && (
            <>
              <span className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
                Mode
              </span>
              <ModeFilter
                value={filters.paymentMode}
                onChange={(m) => onFiltersChange({ paymentMode: m })}
              />
            </>
          )}

          {hasActiveFilters && (
            <>
              <div className="bg-border mx-1 h-4 w-px" />
              <button
                onClick={() =>
                  onFiltersChange({
                    unitIds: [],
                    billTypes: [],
                    outstandingStatus: 'all',
                    paymentMode: '',
                  })
                }
                className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
              >
                Clear all
              </button>
            </>
          )}
        </div>
      )}

      {/* Active filter chips */}
      {(filters.unitIds.length > 0 || filters.billTypes.length > 0) && (
        <div className="mb-3">
          <ActiveFilterChips
            unitIds={filters.unitIds}
            billTypes={filters.billTypes}
            units={units}
            onRemoveUnit={(id) =>
              onFiltersChange({
                unitIds: filters.unitIds.filter((x) => x !== id),
              })
            }
            onRemoveBillType={(t) =>
              onFiltersChange({
                billTypes: filters.billTypes.filter((x) => x !== t),
              })
            }
            onClearAll={() => onFiltersChange({ unitIds: [], billTypes: [] })}
          />
        </div>
      )}

      <TabsContent value="collection">
        <CollectionTab rows={collectionRows} payments={payments} />
      </TabsContent>

      <TabsContent value="outstanding">
        <OutstandingTab
          bills={outstandingBills}
          statusFilter={filters.outstandingStatus}
        />
      </TabsContent>

      <TabsContent value="payments">
        <PaymentsTab payments={payments} />
      </TabsContent>

      <TabsContent value="cash_ledger">
        <CashLedgerTab rows={cashLedgerRows} />
      </TabsContent>

      <TabsContent value="electricity">
        <ElectricityTab
          mescomRows={mescomRows}
          consumptionByPeriod={consumptionByPeriod}
        />
      </TabsContent>
    </Tabs>
  );
}
