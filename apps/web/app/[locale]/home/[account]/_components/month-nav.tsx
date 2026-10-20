import Link from 'next/link';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@kit/ui/button';

/**
 * Elegant month navigation bar: ← Month YYYY → with a highlighted pill
 * showing the current month. Used in Calendar and Expenses.
 */
export function MonthNav(props: {
  month: string;
  prevHref: string;
  nextHref: string;
  'data-test-prev'?: string;
  'data-test-month'?: string;
  'data-test-next'?: string;
}) {
  const label = new Date(`${props.month}-15T12:00:00Z`).toLocaleDateString(
    'en-IN',
    { month: 'long', year: 'numeric', timeZone: 'UTC' },
  );

  const todayMonth = new Date()
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    .slice(0, 7);
  const isCurrent = props.month === todayMonth;

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        nativeButton={false}
        aria-label="Previous month"
        render={<Link href={props.prevHref} scroll={false} />}
        data-test={props['data-test-prev']}
        className="text-muted-foreground hover:text-foreground h-8 w-8 rounded-full"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div
        className="flex items-center gap-2 rounded-full border px-4 py-1.5"
        data-test={props['data-test-month']}
      >
        <span className="text-sm font-semibold tracking-tight tabular-nums">
          {label}
        </span>
        {isCurrent ? (
          <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
            Now
          </span>
        ) : null}
      </div>

      <Button
        variant="ghost"
        size="icon"
        nativeButton={false}
        aria-label="Next month"
        render={<Link href={props.nextHref} scroll={false} />}
        data-test={props['data-test-next']}
        className="text-muted-foreground hover:text-foreground h-8 w-8 rounded-full"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
