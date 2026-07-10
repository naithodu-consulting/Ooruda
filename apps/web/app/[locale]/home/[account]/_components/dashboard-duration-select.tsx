'use client';

import { usePathname, useRouter } from 'next/navigation';

import { cn } from '@kit/ui/utils';

import { getDurationItems } from '~/lib/bill-filter-items';

export function DashboardDurationSelect({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const items = getDurationItems();

  const options = [
    { value: 'current_month', label: 'Current Month' },
    { value: 'prev_month', label: 'Last Month' },
    { value: 'last_3m', label: '3 Months' },
    { value: 'last_6m', label: '6 Months' },
    { value: 'this_fy', label: items.this_fy },
    { value: 'prev_fy', label: items.prev_fy },
    { value: 'all', label: 'All Time' },
  ];

  return (
    <div
      className="bg-muted no-scrollbar flex items-center gap-0.5 overflow-x-auto rounded-full p-0.5"
      data-test="dashboard-duration-select"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => router.replace(`${pathname}?d=${opt.value}`)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors',
            value === opt.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
