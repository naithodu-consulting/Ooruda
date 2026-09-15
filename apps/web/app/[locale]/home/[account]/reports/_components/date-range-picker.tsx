'use client';

import { useState } from 'react';

import { CalendarRange, Loader2 } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { DatePicker } from '@kit/ui/date-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@kit/ui/popover';

import {
  type PresetKey,
  PRESET_RANGES,
  resolvePreset,
} from '../_lib/reports-types';

interface Props {
  preset: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  loading?: boolean;
  onPreset: (key: PresetKey) => void;
  onCustom: (from: string, to: string) => void;
}

/** Format a YYYY-MM-DD string as "10 May 2026" */
function fmtDate(yyyy_mm_dd: string): string {
  const d = new Date(yyyy_mm_dd + 'T00:00:00');
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Format a date range as "10 May – 20 Jun 2026" (drops year on first if same year) */
function fmtRange(from: string, to: string): string {
  const f = new Date(from + 'T00:00:00');
  const t = new Date(to + 'T00:00:00');
  const sameYear = f.getFullYear() === t.getFullYear();
  const fromStr = f.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  const toStr = t.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${fromStr} – ${toStr}`;
}

export function DateRangePicker({
  preset,
  from,
  to,
  loading = false,
  onPreset,
  onCustom,
}: Props) {
  const [open, setOpen] = useState(false);
  // Local state for the popover — reset to current range on open
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      // When "All Time" is active, seed the picker with last 6 months as a starting point
      const fallback = resolvePreset('6m');
      setCustomFrom(from || fallback.from);
      setCustomTo(to || fallback.to);
    }
    setOpen(isOpen);
  };

  const applyCustom = () => {
    if (!customFrom || !customTo || customFrom > customTo) return;
    onCustom(customFrom, customTo);
    setOpen(false);
  };

  const invalid = !!customFrom && !!customTo && customFrom > customTo;

  const customLabel =
    preset === 'custom' && from && to ? fmtRange(from, to) : 'Custom range';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Preset pill row */}
      <div
        className={`flex overflow-x-auto rounded-lg border text-sm transition-opacity ${loading ? 'pointer-events-none opacity-50' : ''}`}
      >
        {PRESET_RANGES.map((p) => (
          <button
            key={p.key}
            onClick={() => onPreset(p.key)}
            disabled={loading}
            className={`shrink-0 px-3 py-1.5 transition-colors first:rounded-l-lg last:rounded-r-lg ${
              preset === p.key
                ? 'bg-primary text-primary-foreground font-medium'
                : 'hover:bg-muted text-muted-foreground'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date range popover */}
      <Popover open={open} onOpenChange={handleOpen}>
        {/* PopoverTrigger renders as <button> — do NOT nest <Button> inside it */}
        <PopoverTrigger
          disabled={loading}
          className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${
            preset === 'custom'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-input bg-background hover:bg-accent hover:text-accent-foreground'
          }`}
        >
          <CalendarRange className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden sm:inline">{customLabel}</span>
          <span className="sm:hidden">
            {preset === 'custom' && from && to ? fmtRange(from, to) : 'Custom'}
          </span>
        </PopoverTrigger>

        <PopoverContent className="w-80 p-4" align="end">
          <p className="mb-3 text-xs font-semibold tracking-wide uppercase">
            Select date range
          </p>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-muted-foreground text-xs font-medium">
                From
              </label>
              <DatePicker
                value={customFrom}
                onChange={setCustomFrom}
                max={customTo || undefined}
              />
              {customFrom && (
                <p className="text-muted-foreground text-xs">
                  {fmtDate(customFrom)}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-muted-foreground text-xs font-medium">
                To
              </label>
              <DatePicker
                value={customTo}
                onChange={setCustomTo}
                min={customFrom || undefined}
              />
              {customTo && (
                <p className="text-muted-foreground text-xs">
                  {fmtDate(customTo)}
                </p>
              )}
            </div>
          </div>

          {invalid && (
            <p className="text-destructive mt-2 text-xs">
              "From" date must be before "To" date.
            </p>
          )}

          {customFrom && customTo && !invalid && (
            <p className="text-muted-foreground mt-2 text-xs">
              Range: {fmtRange(customFrom, customTo)}
            </p>
          )}

          <Button
            size="sm"
            className="mt-3 w-full"
            onClick={applyCustom}
            disabled={invalid || !customFrom || !customTo}
          >
            Apply range
          </Button>
        </PopoverContent>
      </Popover>

      {loading && (
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </span>
      )}
    </div>
  );
}
