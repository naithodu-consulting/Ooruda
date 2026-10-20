'use client';

import { useMemo } from 'react';

import { X } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { MultiSelect } from '@kit/ui/multi-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';

import { sortNaturally } from '~/lib/natural-compare';

import {
  ALL_BILL_TYPES,
  billTypeLabel,
  type OutstandingStatus,
  type UnitOption,
} from '../_lib/reports-types';

// ── Unit multi-select ─────────────────────────────────────────────────────────

interface UnitFilterProps {
  units: UnitOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

export function UnitFilter({ units, selected, onChange }: UnitFilterProps) {
  // Units arrive from `.order('unit_no')`, a text sort that puts A10 before A2.
  const options = useMemo(
    () =>
      sortNaturally(units, (u) => u.unit_no).map((u) => ({
        value: u.id,
        label: u.unit_no,
      })),
    [units],
  );

  return (
    <MultiSelect
      options={options}
      selected={selected}
      onSelectionChange={onChange}
      placeholder="All units"
      summaryLabel="Units"
      searchable
      searchPlaceholder="Search units…"
      emptyMessage="No units found"
      data-test="reports-unit-filter"
    />
  );
}

// ── Bill type multi-select ────────────────────────────────────────────────────

interface BillTypeFilterProps {
  selected: string[];
  onChange: (types: string[]) => void;
}

export function BillTypeFilter({ selected, onChange }: BillTypeFilterProps) {
  const options = useMemo(
    () => ALL_BILL_TYPES.map((t) => ({ value: t, label: billTypeLabel(t) })),
    [],
  );

  return (
    <MultiSelect
      options={options}
      selected={selected}
      onSelectionChange={onChange}
      placeholder="All types"
      summaryLabel="Type"
      emptyMessage="No bill types"
      data-test="reports-bill-type-filter"
    />
  );
}

// ── Outstanding status filter ─────────────────────────────────────────────────

const STATUS_OPTIONS: { key: OutstandingStatus; label: string }[] = [
  { key: 'all', label: 'All outstanding' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'partial', label: 'Partially paid' },
  { key: 'unpaid', label: 'Unpaid' },
];

interface StatusFilterProps {
  value: OutstandingStatus;
  onChange: (s: OutstandingStatus) => void;
}

export function StatusFilter({ value, onChange }: StatusFilterProps) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange((v as OutstandingStatus) || 'all')}
    >
      <SelectTrigger className="h-9" data-test="reports-status-filter">
        <SelectValue placeholder="All outstanding" />
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((o) => (
          <SelectItem key={o.key} value={o.key}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Payment mode filter ───────────────────────────────────────────────────────

const MODES = [
  'UPI',
  'NEFT',
  'RTGS',
  'Cash',
  'Cheque',
  'Razorpay',
  'NetBanking',
];

/** Select has no empty-string value, so "all" needs a sentinel. */
const ALL_MODES = '__all__';

interface ModeFilterProps {
  value: string;
  onChange: (m: string) => void;
}

export function ModeFilter({ value, onChange }: ModeFilterProps) {
  return (
    <Select
      value={value === '' ? ALL_MODES : value}
      onValueChange={(v) => onChange(!v || v === ALL_MODES ? '' : v)}
    >
      <SelectTrigger className="h-9" data-test="reports-mode-filter">
        <SelectValue placeholder="All modes" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_MODES}>All modes</SelectItem>
        {MODES.map((m) => (
          <SelectItem key={m} value={m}>
            {m}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Active filter chips row ───────────────────────────────────────────────────

interface ActiveChipsProps {
  unitIds: string[];
  billTypes: string[];
  units: UnitOption[];
  onRemoveUnit: (id: string) => void;
  onRemoveBillType: (t: string) => void;
  onClearAll: () => void;
}

export function ActiveFilterChips({
  unitIds,
  billTypes,
  units,
  onRemoveUnit,
  onRemoveBillType,
  onClearAll,
}: ActiveChipsProps) {
  if (unitIds.length === 0 && billTypes.length === 0) return null;

  const unitNoById = new Map(units.map((u) => [u.id, u.unit_no]));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {unitIds.map((id) => (
        <Badge
          key={id}
          variant="secondary"
          className="gap-1 pr-1 text-xs font-normal"
        >
          {unitNoById.get(id) ?? id}
          <button
            onClick={() => onRemoveUnit(id)}
            className="hover:text-foreground ml-0.5"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </Badge>
      ))}
      {billTypes.map((t) => (
        <Badge
          key={t}
          variant="secondary"
          className="gap-1 pr-1 text-xs font-normal"
        >
          {billTypeLabel(t)}
          <button
            onClick={() => onRemoveBillType(t)}
            className="hover:text-foreground ml-0.5"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </Badge>
      ))}
      <button
        onClick={onClearAll}
        className="text-muted-foreground hover:bg-accent hover:text-foreground hover:border-border inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-0.5 text-xs font-medium transition-colors"
        data-test="filter-clear-all"
      >
        <X className="h-3 w-3" />
        Clear all
      </button>
    </div>
  );
}
