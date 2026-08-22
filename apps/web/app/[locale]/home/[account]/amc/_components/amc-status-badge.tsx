'use client';

import { Badge } from '@kit/ui/badge';
import { cn } from '@kit/ui/utils';

type AmcStatus =
  | 'active'
  | 'due_soon'
  | 'urgent'
  | 'critical'
  | 'expired'
  | 'terminated';

const STATUS_CONFIG: Record<AmcStatus, { label: string; className: string }> = {
  active: {
    label: 'Active',
    className:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  due_soon: {
    label: 'Due Soon',
    className:
      'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  },
  urgent: {
    label: 'Urgent',
    className:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  },
  critical: {
    label: 'Critical',
    className:
      'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  },
  expired: {
    label: 'Expired',
    className: 'bg-destructive/10 text-destructive',
  },
  terminated: {
    label: 'Terminated',
    className: 'bg-muted text-muted-foreground',
  },
};

export function AmcStatusBadge({ status }: { status: AmcStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <Badge
      variant={'outline'}
      className={cn('border-transparent text-xs font-medium', cfg.className)}
    >
      {cfg.label}
    </Badge>
  );
}

export function getStatusRowClass(status: AmcStatus): string {
  if (status === 'critical') return 'border-l-4 border-l-orange-400';
  if (status === 'expired') return 'border-l-4 border-l-destructive';
  if (status === 'urgent') return 'border-l-4 border-l-amber-400';
  return '';
}
