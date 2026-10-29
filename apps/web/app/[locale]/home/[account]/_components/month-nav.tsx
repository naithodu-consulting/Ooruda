'use client';

import { useState } from 'react';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import {
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@kit/ui/popover';
import { cn } from '@kit/ui/utils';

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * Segmented month navigation bar: [ ← | Month YYYY | → ] with an interactive
 * month/year picker popover and an integrated reset button when viewing a
 * non-current month. Used in Calendar and Expenses.
 */
export function MonthNav(props: {
  month: string;
  prevHref: string;
  nextHref: string;
  todayHref?: string;
  todayLabel?: string;
  'data-test-prev'?: string;
  'data-test-month'?: string;
  'data-test-next'?: string;
  'data-test-today'?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [yearStr, monthStr] = props.month.split('-');
  const currentYear = Number(yearStr) || new Date().getFullYear();
  const currentMonthIdx = (Number(monthStr) || 1) - 1;

  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(currentYear);

  const label = new Date(`${props.month}-15T12:00:00Z`).toLocaleDateString(
    'en-IN',
    { month: 'long', year: 'numeric', timeZone: 'UTC' },
  );

  const todayMonth = new Date()
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    .slice(0, 7);
  const isCurrent = props.month === todayMonth;

  function selectMonth(targetMonth: string) {
    const q = new URLSearchParams(searchParams.toString());
    q.set('month', targetMonth);
    setOpen(false);
    router.push(`${pathname}?${q.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="bg-card inline-flex h-9 items-center overflow-hidden rounded-lg border shadow-2xs">
        <Link
          href={props.prevHref}
          scroll={false}
          aria-label="Previous month"
          data-test={props['data-test-prev']}
          className="text-muted-foreground hover:bg-muted/70 hover:text-foreground focus-visible:bg-muted/70 inline-flex h-full w-9 items-center justify-center border-r transition-colors focus-visible:outline-none"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>

        <Popover
          open={open}
          onOpenChange={(next) => {
            if (next) setPickerYear(currentYear);
            setOpen(next);
          }}
        >
          <PopoverTrigger
            render={
              <button
                type="button"
                data-test={props['data-test-month']}
                aria-label={`Selected month: ${label}. Click to jump to another month.`}
                className="hover:bg-muted/70 focus-visible:bg-muted/70 inline-flex h-full min-w-[168px] cursor-pointer items-center justify-center gap-2 px-3.5 transition-colors focus-visible:outline-none"
              />
            }
          >
            <CalendarIcon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
            <span className="text-sm font-semibold tracking-tight tabular-nums">
              {label}
            </span>
            {isCurrent ? (
              <span
                className="bg-primary h-1.5 w-1.5 rounded-full"
                title="Current month"
              />
            ) : null}
          </PopoverTrigger>

          <PopoverContent className="w-64 p-3" align="start">
            <div className="mb-2 flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Previous year"
                onClick={() => setPickerYear((y) => y - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold tabular-nums">
                {pickerYear}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Next year"
                onClick={() => setPickerYear((y) => y + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {SHORT_MONTHS.map((mName, idx) => {
                const ym = `${pickerYear}-${String(idx + 1).padStart(2, '0')}`;
                const selected =
                  pickerYear === currentYear && idx === currentMonthIdx;
                const isTodayM = ym === todayMonth;

                return (
                  <button
                    key={mName}
                    type="button"
                    onClick={() => selectMonth(ym)}
                    className={cn(
                      'rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                      selected
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : isTodayM
                          ? 'border-primary/60 text-brand-ink border font-semibold'
                          : 'hover:bg-muted text-foreground',
                    )}
                  >
                    {mName}
                  </button>
                );
              })}
            </div>

            {!isCurrent ? (
              <div className="mt-2 border-t pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => selectMonth(todayMonth)}
                >
                  Jump to current month
                </Button>
              </div>
            ) : null}
          </PopoverContent>
        </Popover>

        <Link
          href={props.nextHref}
          scroll={false}
          aria-label="Next month"
          data-test={props['data-test-next']}
          className="text-muted-foreground hover:bg-muted/70 hover:text-foreground focus-visible:bg-muted/70 inline-flex h-full w-9 items-center justify-center border-l transition-colors focus-visible:outline-none"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {!isCurrent && props.todayHref ? (
        <Link
          href={props.todayHref}
          scroll={false}
          data-test={props['data-test-today']}
          className="bg-card text-muted-foreground hover:bg-muted/70 hover:text-foreground inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium shadow-2xs transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5 shrink-0" />
          <span>{props.todayLabel ?? 'Today'}</span>
        </Link>
      ) : null}
    </div>
  );
}
