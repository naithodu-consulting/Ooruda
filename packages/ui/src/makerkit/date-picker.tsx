'use client';

import * as React from 'react';

import { CalendarIcon, XIcon } from 'lucide-react';

import { cn } from '../lib/utils';
import { Button } from '../shadcn/button';
import { Calendar } from '../shadcn/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../shadcn/popover';

/**
 * A date picker that speaks `'YYYY-MM-DD'` strings, never `Date` objects.
 *
 * Lives in `makerkit/` rather than `shadcn/` because the string contract below
 * is project-specific: `shadcn/` mirrors upstream and can be overwritten by the
 * shadcn CLI at any time. It composes the untouched `shadcn/calendar` and
 * `shadcn/popover` primitives.
 *
 * This is deliberate. Postgres `date` columns come back from PostgREST as
 * plain `'YYYY-MM-DD'`, and the obvious conversions silently move the day:
 *
 *   new Date('2026-06-10')        // UTC midnight — 10 Jun becomes 9 Jun in IST
 *   someDate.toISOString()        // re-anchors to UTC — same shift, other way
 *
 * Either one is a day's drift near midnight, which on a bill due date or a
 * payment date is a real accounting error. The conversions below stay in local
 * civil time so a date goes in and comes back out unchanged, and callers keep
 * handling the same string shape the database and `~/lib/billing-dates` use.
 */

/** `'YYYY-MM-DD'` → a Date at *local* midnight (never UTC-parsed). */
function ymdToLocalDate(ymd: string | undefined): Date | undefined {
  if (!ymd) return undefined;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return undefined;

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));

  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Date → `'YYYY-MM-DD'` read from local civil fields (never `toISOString`). */
function localDateToYmd(date: Date | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return '';

  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export interface DatePickerProps {
  /** Current value as `'YYYY-MM-DD'`. Empty string means no date. */
  value?: string;
  /** Receives `'YYYY-MM-DD'`, or `''` when cleared. */
  onChange: (value: string) => void;
  /** Earliest selectable date, `'YYYY-MM-DD'`. */
  min?: string;
  /** Latest selectable date, `'YYYY-MM-DD'`. */
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Shows a clear affordance once a date is set. */
  clearable?: boolean;
  id?: string;
  name?: string;
  className?: string;
  'data-test'?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  onBlur?: () => void;
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = 'Select a date',
  disabled,
  clearable,
  id,
  name,
  className,
  onBlur,
  ...aria
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  const selected = ymdToLocalDate(value);
  const minDate = ymdToLocalDate(min);
  const maxDate = ymdToLocalDate(max);

  // react-day-picker's Matcher requires real Dates, so only include the bounds
  // that were actually supplied.
  const disabledMatchers = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];

  // The locale is pinned rather than left to the runtime default. With
  // `undefined` the server formats in Node's locale and the browser in the
  // user's, so SSR emitted "Apr 01, 2026" against the client's "01 Apr 2026"
  // and React threw a hydration mismatch. `en-IN` also matches
  // `formatDateReadable`, so a picker and a table show the same date the
  // same way.
  const label = selected
    ? selected.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : placeholder;

  function handleSelect(date: Date | undefined) {
    // react-day-picker treats a click on the already-selected day as a
    // toggle and hands back `undefined` (see `useSingle`: "If the date is
    // the same, clear the selection"). A user re-clicking the highlighted
    // day means "yes, this one", not "clear it" — and on a payment or due
    // date that silently wrote an empty value. Clearing stays deliberate,
    // via the `clearable` X below.
    if (!date) {
      setOpen(false);
      return;
    }

    onChange(localDateToYmd(date));
    setOpen(false);
    onBlur?.();
  }

  return (
    <div className={cn('relative', className)}>
      {/*
        The value is mirrored into a hidden input so the picker still works
        inside a plain (uncontrolled) form post, matching what the native
        `<input type="date">` it replaces used to contribute.
      */}
      {name ? <input type="hidden" name={name} value={value ?? ''} /> : null}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              disabled={disabled}
              data-test={aria['data-test']}
              aria-label={aria['aria-label'] ?? placeholder}
              aria-invalid={aria['aria-invalid']}
              // `bg-transparent` matches SelectTrigger: the Button `outline`
              // variant hardcodes `bg-background` (cream), which reads as tan
              // next to the white Inputs beside it inside a dialog.
              className={cn(
                'w-full justify-start gap-2 bg-transparent font-normal',
                !selected && 'text-muted-foreground',
                clearable && selected && 'pr-8',
              )}
            >
              <CalendarIcon className="size-4 shrink-0 opacity-70" />
              <span className="truncate">{label}</span>
            </Button>
          }
        />

        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={handleSelect}
            disabled={disabledMatchers.length ? disabledMatchers : undefined}
            autoFocus
          />
        </PopoverContent>
      </Popover>

      {clearable && selected && !disabled ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear date"
          data-test={
            aria['data-test']
              ? `${aria['data-test']}-clear`
              : 'date-picker-clear'
          }
          className={
            'text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded-sm transition-colors'
          }
        >
          <XIcon className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
