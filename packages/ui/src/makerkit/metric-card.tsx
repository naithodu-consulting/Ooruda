import type { LucideIcon } from 'lucide-react';

import { cn } from '../lib/utils';

// Tone text colours are the -700 shades (or tokens) so labels, values and
// sublabels all clear WCAG AA on their tinted tile.
const variantClasses = {
  blue: 'bg-blue-50 border-blue-200 text-blue-700',
  green: 'bg-green-50 border-green-200 text-success',
  amber: 'bg-[#FEF8E3] border-[#F3DF9A] text-brand-ink',
  red: 'bg-red-50 border-red-200 text-destructive',
  purple: 'bg-purple-50 border-purple-200 text-purple-700',
  teal: 'bg-teal-50 border-teal-200 text-teal-700',
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
        'relative h-full min-w-0 overflow-hidden rounded-2xl border p-4 sm:p-5',
        variantClasses[variant],
        className,
      )}
    >
      {/* Decorative corner circle - prototype flourish (bleeds off bottom-right) */}
      <div className="pointer-events-none absolute -right-3 -bottom-3 h-16 w-16 rounded-full bg-current opacity-[0.07]" />

      <div className="relative flex min-w-0 items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
        <span className="min-w-0 truncate">{label}</span>
      </div>

      <div className="relative mt-1.5 text-xl leading-tight font-bold tracking-tight break-words tabular-nums sm:text-2xl">
        {value}
      </div>

      {sublabel ? (
        <div className="text-muted-foreground relative mt-1.5 text-xs font-medium break-words">
          {sublabel}
        </div>
      ) : null}
    </div>
  );
}
