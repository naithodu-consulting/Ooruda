import type { LucideIcon } from 'lucide-react';

import { cn } from '../lib/utils';

const variantClasses = {
  blue: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-400',
  green:
    'bg-green-50 border-green-200 text-green-700 dark:bg-green-500/10 dark:border-green-500/20 dark:text-green-400',
  amber:
    'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400',
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
        'rounded-2xl border p-5',
        variantClasses[variant],
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase opacity-80">
        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
        {label}
      </div>

      <div className="mt-1.5 text-2xl leading-none font-black tracking-tight">
        {value}
      </div>

      {sublabel ? (
        <div className="text-foreground/60 mt-1.5 text-[11px] font-medium">
          {sublabel}
        </div>
      ) : null}
    </div>
  );
}
