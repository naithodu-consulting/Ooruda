'use client';

import { useMemo, useState } from 'react';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { cn } from '@kit/ui/utils';

import { addDays } from '~/lib/villa-db/dates';

/**
 * The nights of a month, as a calendar grid.
 *
 * A night belongs to the day it starts on, which is how the rate card and
 * the guest both think of it ("Friday night costs more"), so the grid is an
 * ordinary month — no half-open cleverness on screen.
 */
export interface RateCalendarNight {
  /** 'YYYY-MM-DD' */
  date: string;
  /** Rupees actually charged for this night today. */
  rate: number;
  /** The named rate covering it, if any. */
  ruleName: string | null;
  isWeekend: boolean;
  /** Gone: a rate cannot be set for a night that has already happened. */
  isPast: boolean;
  /**
   * The night belongs to a rate other than the one being edited, so it
   * cannot be taken: two rates on one night would let checkout and the
   * homepage widget quote different prices. Edit that rate to free it.
   */
  lockedBy: string | null;
}

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** Fri/Sat, the same test the booking site's pricing engine applies. */
export function isWeekendNight(ymd: string): boolean {
  const day = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return day === 5 || day === 6;
}

function monthStart(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

function addMonths(monthYmd: string, months: number): string {
  const [y, m] = monthYmd.split('-').map(Number);
  const zero = y! * 12 + (m! - 1) + months;
  const year = Math.floor(zero / 12);
  const month = (zero % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function monthLabel(monthYmd: string): string {
  const [y, m] = monthYmd.split('-').map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

/** Every date in the month, plus the blanks that pad the first week. */
function monthCells(monthYmd: string): (string | null)[] {
  const [y, m] = monthYmd.split('-').map(Number);
  const first = new Date(Date.UTC(y!, m! - 1, 1));
  const daysInMonth = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from(
    { length: first.getUTCDay() },
    () => null,
  );

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(`${monthYmd.slice(0, 7)}-${String(day).padStart(2, '0')}`);
  }

  return cells;
}

/** ₹12,000 → "12k", ₹12,500 → "12.5k". Room for a price inside a day cell. */
function shortRupees(amount: number): string {
  if (amount < 1000) return String(Math.round(amount));
  const thousands = amount / 1000;
  const text = thousands % 1 === 0 ? String(thousands) : thousands.toFixed(1);
  return `${text}k`;
}

/** The nights between two dates, inclusive — for shift-click. */
function nightsBetween(a: string, b: string): string[] {
  const [from, to] = a <= b ? [a, b] : [b, a];
  const out: string[] = [];
  for (let d = from!; d <= to!; d = addDays(d, 1)) out.push(d);
  return out;
}

export function RateCalendar(props: {
  /** Looked up per night; absent dates fall back to the base rates. */
  nightFor: (date: string) => RateCalendarNight;
  selected: ReadonlySet<string>;
  onSelectedChange: (next: Set<string>) => void;
  /** Today in the villa's timezone — everything before it is read-only. */
  today: string;
  disabled?: boolean;
}) {
  const [month, setMonth] = useState(() => monthStart(props.today));
  // Where a shift-click measures from.
  const [anchor, setAnchor] = useState<string | null>(null);

  const months = useMemo(() => [month, addMonths(month, 1)], [month]);

  const toggle = (date: string, extend: boolean) => {
    const next = new Set(props.selected);

    if (extend && anchor) {
      // Shift-click paints the whole stretch on, which is what people mean
      // by it; clicking a night on its own still toggles.
      for (const night of nightsBetween(anchor, date)) {
        const n = props.nightFor(night);
        if (!n.isPast && !n.lockedBy) next.add(night);
      }
    } else if (next.has(date)) {
      next.delete(date);
    } else {
      next.add(date);
    }

    setAnchor(date);
    props.onSelectedChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Previous month"
          onClick={() => setMonth(addMonths(month, -1))}
          data-test={'villa-rate-cal-prev'}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span
          className="text-sm font-medium"
          data-test={'villa-rate-cal-month'}
        >
          {monthLabel(months[0]!)}
          <span className="text-muted-foreground hidden sm:inline">
            {' '}
            – {monthLabel(months[1]!)}
          </span>
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Next month"
          onClick={() => setMonth(addMonths(month, 1))}
          data-test={'villa-rate-cal-next'}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* One month on a phone, two side by side from `sm`. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {months.map((m, index) => (
          <div
            key={m}
            className={cn(
              'flex flex-col gap-1',
              index === 1 && 'hidden sm:flex',
            )}
          >
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAY_LABELS.map((label) => (
                <span
                  key={label}
                  className="text-muted-foreground py-1 text-center text-[10px] font-medium"
                >
                  {label}
                </span>
              ))}

              {monthCells(m).map((date, i) => {
                if (!date) return <span key={`pad-${i}`} />;

                const night = props.nightFor(date);
                const isSelected = props.selected.has(date);
                const unavailable =
                  night.isPast || Boolean(night.lockedBy) || props.disabled;

                return (
                  <button
                    key={date}
                    type="button"
                    disabled={unavailable}
                    aria-pressed={isSelected}
                    aria-label={`${date}${night.ruleName ? `, ${night.ruleName}` : ''}`}
                    title={
                      night.lockedBy
                        ? `${night.lockedBy} — edit that rate to free this night`
                        : (night.ruleName ?? undefined)
                    }
                    data-test={'villa-rate-cal-day'}
                    data-date={date}
                    data-selected={isSelected ? 'true' : undefined}
                    onClick={(e) => toggle(date, e.shiftKey)}
                    className={cn(
                      'flex h-12 flex-col items-center justify-center rounded-md border text-xs transition-colors',
                      'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                      unavailable && !night.lockedBy
                        ? 'text-muted-foreground/50 border-transparent'
                        : null,
                      !unavailable && 'hover:border-primary cursor-pointer',
                      // A night another rate owns still shows its colour, so
                      // it reads as "taken", not as "missing".
                      night.lockedBy &&
                        !night.isPast &&
                        'border-primary/30 bg-primary/5 text-muted-foreground cursor-not-allowed',
                      // A named rate is the loudest thing on the grid: it is
                      // what the operator came here to see.
                      !isSelected &&
                        !unavailable &&
                        night.ruleName &&
                        'border-primary/40 bg-primary/10',
                      !isSelected &&
                        !unavailable &&
                        !night.ruleName &&
                        'bg-card border-border',
                      isSelected &&
                        'border-primary bg-primary text-primary-foreground',
                    )}
                  >
                    <span className="font-medium">{Number(date.slice(8))}</span>
                    <span
                      className={cn(
                        'text-[10px] tabular-nums',
                        !isSelected && 'text-muted-foreground',
                        !isSelected && night.isWeekend && 'font-medium',
                      )}
                    >
                      {shortRupees(night.rate)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="text-muted-foreground text-xs">
        Click nights to select them. Shift-click to take in everything up to
        that night. Past nights, and nights already on another rate, cannot be
        picked.
      </p>
    </div>
  );
}
