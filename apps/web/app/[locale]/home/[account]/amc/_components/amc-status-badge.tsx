'use client';

import { Badge } from '@kit/ui/badge';
import { cn } from '@kit/ui/utils';

export type AmcStatus =
  | 'active'
  | 'due_soon'
  | 'urgent'
  | 'critical'
  | 'expired'
  | 'terminated';

const STATUS_CONFIG: Record<AmcStatus, { label: string; className: string }> = {
  active: {
    label: 'Active',
    className: 'border-transparent bg-primary/10 text-primary',
  },
  due_soon: {
    label: 'Due Soon',
    className: 'border-transparent bg-muted text-muted-foreground',
  },
  urgent: {
    label: 'Urgent',
    className: 'border-transparent bg-warning/15 text-warning-foreground',
  },
  critical: {
    label: 'Critical',
    className: 'border-transparent bg-destructive/15 text-destructive',
  },
  expired: {
    label: 'Expired',
    className:
      'border-transparent bg-destructive/20 text-destructive font-semibold',
  },
  terminated: {
    label: 'Terminated',
    className: 'border-transparent bg-muted text-muted-foreground',
  },
};

export function AmcStatusBadge({ status }: { status: AmcStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.terminated;
  return (
    <Badge
      variant={'outline'}
      className={cn('text-xs font-medium', cfg.className)}
    >
      {cfg.label}
    </Badge>
  );
}

export function getStatusRowClass(status: AmcStatus): string {
  if (status === 'critical' || status === 'expired')
    return 'border-l-4 border-l-destructive/60';
  if (status === 'urgent') return 'border-l-4 border-l-warning/60';
  return '';
}
