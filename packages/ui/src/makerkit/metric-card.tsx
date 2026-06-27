import type { LucideIcon } from 'lucide-react';

import { cn } from '../lib/utils';

const variantClasses = {
  blue: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-400',
  green:
    'bg-green-50 border-green-200 text-green-700 dark:bg-green-500/10 dark:border-green-500/20 dark:text-green-400',
  amber: 'bg-[#FEF8E3] border-[#F3DF9A] text-[#8A6A12]',
  red: 'bg-red-50 border-red-200 text-red-700 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400',
  purple:
    'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-500/10 dark:border-purple-500/20 dark:text-purple-400',
  teal: 'bg-teal-50 border-teal-200 text-teal-700 dark:bg-teal-500/10 dark:border-teal-500/20 dark:text-teal-400',
};

export function MetricCard({
  icon: Icon,
  label,
  value,
  sublabel,
  variant,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sublabel?: string;
  variant: keyof typeof variantClasses;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative min-w-0 overflow-hidden rounded-2xl border p-4 sm:p-5',
        variantClasses[variant],
        className,
      )}
    >
      {/* Decorative corner circle — prototype flourish (bleeds off bottom-right) */}
      <div className="pointer-events-none absolute -right-3 -bottom-3 h-16 w-16 rounded-full bg-current opacity-[0.07]" />

      <div className="relative flex min-w-0 items-center gap-1.5 text-[10.5px] font-bold tracking-wide uppercase opacity-75">
        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
        <span className="min-w-0 truncate">{label}</span>
      </div>

      <div className="relative mt-1.5 text-xl leading-tight font-black tracking-tight break-words sm:text-2xl">
        {value}
      </div>

      {sublabel ? (
        <div className="text-foreground/55 relative mt-1.5 text-[10.5px] font-medium break-words">
          {sublabel}
        </div>
      ) : null}
    </div>
  );
}
