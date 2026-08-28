'use client';

import dynamic from 'next/dynamic';

import { X } from 'lucide-react';

import { Tabs, TabsContent } from '@kit/ui/tabs';
import { cn } from '@kit/ui/utils';

import type { StatementEntry } from '../../statement/_lib/statement-types';
import {
  type AdvanceRow,
  type CashLedgerRow,
  type CollectionRow,
  type DirectoryRow,
  type GstSummaryRow,
  type MescomRow,
  type OccupancyRow,
  type OtherChargeRow,
  type OutstandingBill,
  type PaymentModeRow,
  type PaymentRow,
  type ReportsFilters,
  type TabKey,
  type UnitConsumptionRow,
  type UnitOption,
  type UnitOutstandingRow,
} from '../_lib/reports-types';
import { ExportButton } from './export-button';
import {
  ActiveFilterChips,
  BillTypeFilter,
  ModeFilter,
  StatusFilter,
  UnitFilter,
} from './filter-bar';
import type { LedgerView } from './ledger-statement-tab';
import { ReportsSkeleton } from './reports-skeleton';

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
const UnitOutstandingTab = dynamic(
  () =>
    import('./unit-outstanding-tab').then((m) => ({
      default: m.UnitOutstandingTab,
    })),
  {
    ssr: false,
    loading: () => <div className="bg-muted h-64 animate-pulse rounded-lg" />,
  },
);
const PaymentModesTab = dynamic(
  () =>
    import('./payment-modes-tab').then((m) => ({ default: m.PaymentModesTab })),
  {
    ssr: false,
    loading: () => <div className="bg-muted h-64 animate-pulse rounded-lg" />,
  },
);
const AdvancesTab = dynamic(
  () => import('./advances-tab').then((m) => ({ default: m.AdvancesTab })),
  {
    ssr: false,
    loading: () => <div className="bg-muted h-64 animate-pulse rounded-lg" />,
  },
);
const GstSummaryTab = dynamic(
  () => import('./gst-summary-tab').then((m) => ({ default: m.GstSummaryTab })),
  {
    ssr: false,
    loading: () => <div className="bg-muted h-64 animate-pulse rounded-lg" />,
  },
);
const LedgerStatementTab = dynamic(
  () =>
    import('./ledger-statement-tab').then((m) => ({
      default: m.LedgerStatementTab,
    })),
  {
    ssr: false,
    loading: () => <div className="bg-muted h-64 animate-pulse rounded-lg" />,
  },
);
const OccupancyTab = dynamic(
  () => import('./occupancy-tab').then((m) => ({ default: m.OccupancyTab })),
  {
    ssr: false,
    loading: () => <div className="bg-muted h-64 animate-pulse rounded-lg" />,
  },
);
const DirectoryTab = dynamic(
  () => import('./directory-tab').then((m) => ({ default: m.DirectoryTab })),
  {
    ssr: false,
    loading: () => <div className="bg-muted h-64 animate-pulse rounded-lg" />,
  },
);
const OtherChargesTab = dynamic(
  () =>
    import('./other-charges-tab').then((m) => ({ default: m.OtherChargesTab })),
  {
    ssr: false,
    loading: () => <div className="bg-muted h-64 animate-pulse rounded-lg" />,
  },
);

interface Props {
  /** Data for the active tab is in flight. Chrome stays mounted; only the panel swaps. */
  loading: boolean;
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
  unitOutstandingRows: UnitOutstandingRow[];
  paymentModeRows: PaymentModeRow[];
  advanceRows: AdvanceRow[];
  gstSummaryRows: GstSummaryRow[];
  ledgerStatementRows: StatementEntry[];
  ledgerStatementUnitId: string;
  onLedgerStatementUnitChange: (unitId: string) => void;
  ledgerView: LedgerView;
  onLedgerViewChange: (v: LedgerView) => void;
  collectionView: 'received' | 'raised';
  onCollectionViewChange: (v: 'received' | 'raised') => void;
  otherChargeRows: OtherChargeRow[];
  occupancyRows: OccupancyRow[];
  occupancyStatusFilter: 'all' | 'occupied' | 'vacant';
  onOccupancyStatusFilterChange: (v: 'all' | 'occupied' | 'vacant') => void;
  directoryRows: DirectoryRow[];
  directoryRoleFilter: 'all' | 'Owner' | 'Tenant';
  onDirectoryRoleFilterChange: (v: 'all' | 'Owner' | 'Tenant') => void;
}

const TAB_GROUPS = [
  {
    key: 'financial',
    label: 'Financial',
    tabs: [
      { value: 'collection', label: 'Collection' },
      { value: 'outstanding', label: 'Outstanding' },
      { value: 'payments', label: 'Payments' },
      { value: 'cash_ledger', label: 'Cash Ledger' },
      { value: 'unit_outstanding', label: 'Unit Dues' },
      { value: 'ledger_statement', label: 'Unit Account Statement' },
      { value: 'other_charges', label: 'Other Charges' },
      { value: 'gst_summary', label: 'GST Summary' },
    ],
  },
  {
    key: 'analytics',
    label: 'Analytics',
    tabs: [
      { value: 'electricity', label: 'Electricity' },
      { value: 'payment_modes', label: 'Payment Modes' },
      { value: 'advances', label: 'Advances' },
    ],
  },
  {
    key: 'property',
    label: 'Property',
    tabs: [
      { value: 'occupancy', label: 'Occupancy' },
      { value: 'directory', label: 'Directory' },
    ],
  },
] satisfies {
  key: string;
  label: string;
  tabs: { value: string; label: string }[];
}[];

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
  unit_outstanding: ['units'],
  payment_modes: [],
  advances: [],
  gst_summary: ['bill_types'],
  // Ledger statement scopes itself with its own single-unit picker — the shared
  // multi-select unit filter would conflict with a per-unit statement.
  ledger_statement: [],
  occupancy: [],
  directory: [],
  other_charges: ['units'],
};

export function ReportsTabs({
  loading,
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
  unitOutstandingRows,
  paymentModeRows,
  advanceRows,
  gstSummaryRows,
  ledgerStatementRows,
  ledgerStatementUnitId,
  onLedgerStatementUnitChange,
  ledgerView,
  onLedgerViewChange,
  collectionView,
  onCollectionViewChange,
  otherChargeRows,
  occupancyRows,
  occupancyStatusFilter,
  onOccupancyStatusFilterChange,
  directoryRows,
  directoryRoleFilter,
  onDirectoryRoleFilterChange,
}: Props) {
  // The group shown in level 2 is derived from the active tab, so deep links
  // (?tab=directory) land on the correct group without extra state.
  const activeGroup =
    TAB_GROUPS.find((g) => g.tabs.some((t) => t.value === activeTab)) ??
    TAB_GROUPS[0]!;

  // Arrow-key navigation within the active group, wrapping at both ends.
  const onTabListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const delta =
      e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : undefined;

    if (delta === undefined) return;

    e.preventDefault();

    const tabs = activeGroup.tabs;
    const current = tabs.findIndex((t) => t.value === activeTab);
    const next = (current + delta + tabs.length) % tabs.length;

    onTabChange(tabs[next]!.value as TabKey);

    // Move focus to follow selection, as an ARIA tablist is expected to.
    const list = e.currentTarget;
    (
      list.querySelectorAll('[role="tab"]')[next] as HTMLElement | undefined
    )?.focus();
  };

  const tabFilters = TAB_FILTERS[activeTab] ?? [];
  const hasActiveFilters =
    filters.unitIds.length > 0 ||
    filters.billTypes.length > 0 ||
    filters.outstandingStatus !== 'all' ||
    !!filters.paymentMode;

  return (
    <Tabs value={activeTab} onValueChange={(tab) => onTabChange(tab as TabKey)}>
      {/* Level 1: report group + export */}
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="bg-muted flex w-full flex-wrap gap-1 rounded-lg p-1 sm:w-auto">
          {TAB_GROUPS.map((group) => {
            const isActiveGroup = group.label === activeGroup.label;

            return (
              <button
                key={group.label}
                type="button"
                data-test={`reports-group-${group.key}`}
                aria-pressed={isActiveGroup}
                onClick={() => onTabChange(group.tabs[0]!.value as TabKey)}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors sm:flex-none',
                  isActiveGroup
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {group.label}
              </button>
            );
          })}
        </div>

        <div className="flex shrink-0 justify-end">
          <ExportButton
            associationId={associationId}
            from={from}
            to={to}
            activeTab={activeTab}
            filters={filters}
            ledgerUnitId={ledgerStatementUnitId}
          />
        </div>
      </div>

      {/* Level 2: reports within the selected group.
          Classic "connected tab bar": the container has a full-width dividing
          line (border-b), and the active tab's border-b-2 overlaps it via
          -mb-px so the indicator reads as part of the structure, not a
          floating underline. This is the GitHub/Stripe/Linear pattern. */}
      <div
        role="tablist"
        className="border-border mb-4 flex flex-wrap items-center gap-x-1 border-b"
        onKeyDown={onTabListKeyDown}
      >
        {activeGroup.tabs.map((t) => {
          const isActive = t.value === activeTab;

          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              data-test={`reports-tab-${t.value}`}
              onClick={() => onTabChange(t.value as TabKey)}
              className={cn(
                '-mb-px border-b-2 px-3 pb-2 pt-1 text-sm whitespace-nowrap transition-colors',
                isActive
                  ? 'border-foreground text-foreground font-semibold'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground font-medium',
              )}
            >
              {t.label}
            </button>
          );
        })}
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
                className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-0.5 text-xs font-medium transition-colors hover:border-border"
                data-test="filter-clear-all-inline"
              >
                <X className="h-3 w-3" />
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

      {/* Panel region only. The tab bar, filter bar and export button above
          stay mounted while data loads — swapping the whole component out was
          what made every tab change flash and jump. */}
      {loading ? (
        <div className="min-h-[420px]">
          <ReportsSkeleton />
        </div>
      ) : (
        <div className="min-h-[420px]">
          <TabsContent value="collection">
            <CollectionTab
              associationId={associationId}
              from={from}
              to={to}
              unitIds={filters.unitIds}
              rows={collectionRows}
              payments={payments}
              onViewChange={onCollectionViewChange}
            />
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

          <TabsContent value="unit_outstanding">
            <UnitOutstandingTab rows={unitOutstandingRows} />
          </TabsContent>

          <TabsContent value="payment_modes">
            <PaymentModesTab rows={paymentModeRows} />
          </TabsContent>

          <TabsContent value="advances">
            <AdvancesTab rows={advanceRows} />
          </TabsContent>

          <TabsContent value="gst_summary">
            <GstSummaryTab rows={gstSummaryRows} />
          </TabsContent>

          <TabsContent value="ledger_statement">
            <LedgerStatementTab
              rows={ledgerStatementRows}
              units={units}
              selectedUnitId={ledgerStatementUnitId}
              onSelectedUnitChange={onLedgerStatementUnitChange}
              view={ledgerView}
              onViewChange={onLedgerViewChange}
            />
          </TabsContent>

          <TabsContent value="occupancy">
            <OccupancyTab
              rows={occupancyRows}
              statusFilter={occupancyStatusFilter}
              onStatusFilterChange={onOccupancyStatusFilterChange}
            />
          </TabsContent>

          <TabsContent value="directory">
            <DirectoryTab
              rows={directoryRows}
              roleFilter={directoryRoleFilter}
              onRoleFilterChange={onDirectoryRoleFilterChange}
            />
          </TabsContent>

          <TabsContent value="other_charges">
            <OtherChargesTab
              associationId={associationId}
              from={from}
              to={to}
              unitIds={filters.unitIds}
              rows={otherChargeRows}
            />
          </TabsContent>
        </div>
      )}
    </Tabs>
  );
}
