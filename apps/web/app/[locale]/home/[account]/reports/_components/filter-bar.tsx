'use client';

import { useState } from 'react';

import { Check, ChevronDown, X } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';

import {
  ALL_BILL_TYPES,
  billTypeLabel,
  type OutstandingStatus,
  type UnitOption,
} from '../_lib/reports-types';

// ── Shared trigger style ──────────────────────────────────────────────────────

function triggerCn(active: boolean) {
  return [
    'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium',
    'transition-colors focus:outline-none disabled:pointer-events-none disabled:opacity-50',
    active
      ? 'bg-primary text-primary-foreground border-primary'
      : 'border-input bg-background hover:bg-accent hover:text-accent-foreground',
  ].join(' ');
}

// ── Unit multi-select ─────────────────────────────────────────────────────────

interface UnitFilterProps {
  units: UnitOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

export function UnitFilter({ units, selected, onChange }: UnitFilterProps) {
  const [search, setSearch] = useState('');

  const filtered = search
    ? units.filter((u) =>
        u.unit_no.toLowerCase().includes(search.toLowerCase()),
      )
    : units;

  const toggle = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  };

  const label =
    selected.length === 0
      ? 'All units'
      : selected.length === 1
        ? (units.find((u) => u.id === selected[0])?.unit_no ?? '1 unit')
        : `${selected.length} units`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={triggerCn(selected.length > 0)}>
        {label}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52 p-1">
        <div className="px-2 py-1.5">
          <input
            autoFocus
            placeholder="Search unit…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-input bg-background text-foreground focus:ring-ring h-7 w-full rounded border px-2 text-xs focus:ring-1 focus:outline-none"
          />
        </div>
        <div className="max-h-56 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="text-muted-foreground px-2 py-3 text-center text-xs">
              No units found
            </p>
          )}
          {filtered.map((u) => (
            <DropdownMenuItem
              key={u.id}
              closeOnClick={false}
              onClick={() => toggle(u.id)}
              className="flex items-center gap-2 text-xs"
            >
              <span
                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
                  selected.includes(u.id)
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-muted-foreground/40'
                }`}
              >
                {selected.includes(u.id) && <Check className="h-2.5 w-2.5" />}
              </span>
              {u.unit_no}
            </DropdownMenuItem>
          ))}
        </div>
        {selected.length > 0 && (
          <div className="border-t px-1 pt-1">
            <button
              onClick={() => onChange([])}
              className="text-muted-foreground hover:text-foreground w-full rounded px-2 py-1 text-left text-xs"
            >
              Clear selection
            </button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Bill type multi-select ────────────────────────────────────────────────────

interface BillTypeFilterProps {
  selected: string[];
  onChange: (types: string[]) => void;
}

export function BillTypeFilter({ selected, onChange }: BillTypeFilterProps) {
  const toggle = (t: string) => {
    onChange(
      selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t],
    );
  };

  const label =
    selected.length === 0
      ? 'All types'
      : selected.length === 1
        ? billTypeLabel(selected[0])
        : `${selected.length} types`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={triggerCn(selected.length > 0)}>
        {label}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44 p-1">
        {ALL_BILL_TYPES.map((t) => (
          <DropdownMenuItem
            key={t}
            closeOnClick={false}
            onClick={() => toggle(t)}
            className="flex items-center gap-2 text-xs"
          >
            <span
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
                selected.includes(t)
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'border-muted-foreground/40'
              }`}
            >
              {selected.includes(t) && <Check className="h-2.5 w-2.5" />}
            </span>
            {billTypeLabel(t)}
          </DropdownMenuItem>
        ))}
        {selected.length > 0 && (
          <div className="border-t px-1 pt-1">
            <button
              onClick={() => onChange([])}
              className="text-muted-foreground hover:text-foreground w-full rounded px-2 py-1 text-left text-xs"
            >
              Clear
            </button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
  const label =
    STATUS_OPTIONS.find((o) => o.key === value)?.label ?? 'All outstanding';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={triggerCn(value !== 'all')}>
        {label}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44 p-1">
        {STATUS_OPTIONS.map((o) => (
          <DropdownMenuItem
            key={o.key}
            onClick={() => onChange(o.key)}
            className="flex items-center gap-2 text-xs"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${value === o.key ? 'bg-primary' : 'bg-transparent'}`}
            />
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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

interface ModeFilterProps {
  value: string;
  onChange: (m: string) => void;
}

export function ModeFilter({ value, onChange }: ModeFilterProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={triggerCn(!!value)}>
        {value || 'All modes'}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40 p-1">
        <DropdownMenuItem onClick={() => onChange('')} className="text-xs">
          <span
            className={`mr-2 h-1.5 w-1.5 rounded-full ${!value ? 'bg-primary' : 'bg-transparent'}`}
          />
          All modes
        </DropdownMenuItem>
        {MODES.map((m) => (
          <DropdownMenuItem
            key={m}
            onClick={() => onChange(m)}
            className="text-xs"
          >
            <span
              className={`mr-2 h-1.5 w-1.5 rounded-full ${value === m ? 'bg-primary' : 'bg-transparent'}`}
            />
            {m}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
