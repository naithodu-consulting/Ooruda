import type { LucideIcon } from 'lucide-react';

import { Badge } from '../shadcn/badge';
import { cn } from '../lib/utils';

const colorVariants = {
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  green: 'bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400',
  purple:
    'bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400',
};

export function ComingSoonState({
  icon: Icon,
  title,
  description,
  week,
  roleLabel,
  color = 'amber',
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  week: number;
  roleLabel?: string;
  color?: keyof typeof colorVariants;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed py-20 text-center',
        className,
      )}
    >
      <div
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-2xl',
          colorVariants[color],
        )}
      >
        <Icon className="h-7 w-7" strokeWidth={1.75} />
      </div>

      <div className="space-y-1.5">
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        <p className="text-muted-foreground max-w-sm text-sm">
          {description}
        </p>
      </div>

      <div className="mt-1 flex items-center gap-2">
        <Badge variant="outline" className="font-medium">
          Coming in Week {week}
        </Badge>

        {roleLabel ? (
          <Badge variant="secondary" className="font-medium">
            {roleLabel}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
