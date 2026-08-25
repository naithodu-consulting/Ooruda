'use client';

import { useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import {
  AlertTriangle,
  Banknote,
  Building2,
  FileText,
  Key,
  Search,
  Settings,
  Zap,
} from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { cn } from '@kit/ui/utils';

/** Maps an action key prefix to a Lucide icon for the event row. */
export function ActionIcon({ action }: { action: string }) {
  const cls = 'text-muted-foreground h-4 w-4 shrink-0';
  if (action.startsWith('payment') || action.startsWith('razorpay'))
    return <Banknote className={cls} />;
  if (action.startsWith('bill') || action.startsWith('bills'))
    return <FileText className={cls} />;
  if (
    action.startsWith('meter') ||
    action.startsWith('mescom') ||
    action.startsWith('sub_meter')
  )
    return <Zap className={cls} />;
  if (action.startsWith('unit') || action.startsWith('tenancy'))
    return <Building2 className={cls} />;
  if (action.startsWith('auth')) return <Key className={cls} />;
  if (
    action.startsWith('billing_settings') ||
    action.startsWith('notifications')
  )
    return <Settings className={cls} />;
  if (action.includes('error') || action.includes('failed'))
    return <AlertTriangle className="text-destructive h-4 w-4 shrink-0" />;
  return null;
}

export const ACTION_LABELS: Record<string, string> = {
  'unit.created': 'Unit added',
  'unit.updated': 'Unit updated',
  'unit.deleted': 'Unit deleted',
  'unit.owner_assigned': 'Owner assigned',
  'unit.owner_unassigned': 'Owner unassigned',
  'unit.bulk_imported': 'Bulk unit import',
  'tenancy.started': 'Tenant assigned',
  'tenancy.ended': 'Tenancy ended',
  'bills.generated': 'Bills generated',
  'bills.generation.failed': 'Bill generation failed',
  'bill.updated': 'Bill updated',
  'bill.pdf_generated': 'Bill PDF generated',
  'payment.recorded': 'Payment recorded',
  'payment.record.failed': 'Payment failed',
  'payment.voided': 'Payment voided',
  'payment.void.failed': 'Payment void failed',
  'receipt.pdf_generated': 'Receipt PDF generated',
  'mescom_bill.created': 'Electricity bill added',
  'mescom_bill.create.failed': 'Electricity bill failed',
  'mescom_bill.deleted': 'Electricity bill deleted',
  'mescom_bill.delete.failed': 'Electricity bill delete failed',
  'meter_readings.recorded': 'Meter readings recorded',
  'meter_readings.record.failed': 'Meter readings failed',
  'meter_readings.bulk_imported': 'Meter readings imported',
  'meter_readings.bulk_import.failed': 'Meter readings import failed',
  'sub_meter.bulk_imported': 'Sub-meters imported',
  'sub_meter.bulk_import.failed': 'Sub-meter import failed',
  'billing_settings.updated': 'Billing settings updated',
  'notifications.bulk_sent': 'Bulk reminders sent',
  'reminders.cron.completed': 'Reminder cron ran',
  'bill_dispatch.completed': 'Bill dispatch completed',
  'bill_dispatch.item.failed': 'Bill dispatch item failed',
  'razorpay.payment.captured': 'Razorpay payment captured',
  'razorpay.payment.failed': 'Razorpay payment failed',
  'razorpay.due_payment.failed': 'Razorpay due-payment failed',
  'razorpay.refund.processed': 'Razorpay refund processed',
  'razorpay.refund.failed': 'Razorpay refund failed',
  'expense.created': 'Expense added',
  'expense.updated': 'Expense updated',
  'expense.deleted': 'Expense deleted',
  'amc.contract.created': 'AMC contract added',
  'amc.contract.updated': 'AMC contract updated',
  'amc.contract.renewed': 'AMC contract renewed',
  'amc.contract.terminated': 'AMC contract ended',
  'amc.contract.deleted': 'AMC contract deleted',
  'amc.settings.updated': 'AMC reminder settings updated',
  'request.unhandled_error': 'Unhandled server error',
  'auth.login': 'Signed in',
  'auth.logout': 'Signed out',
  'auth.signup': 'Signed up',
  'auth.user.created': 'User created',
  'auth.password_recovery': 'Password recovery',
  'auth.mfa.challenge': 'MFA challenge',
  'auth.mfa.verify': 'MFA verified',
  'auth.token_refreshed': 'Token refreshed',
};

export function actionLabel(action: string): string {
  return (
    ACTION_LABELS[action] ??
    action.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function truncateSummary(summary: string | null, max = 90): string {
  if (!summary) return '—';
  const braceIdx = summary.search(/[{[]/);
  const stripped = braceIdx > 0 ? summary.slice(0, braceIdx).trim() : '';
  const text = stripped || (braceIdx === 0 ? 'An error occurred.' : summary);
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

/** Shows an event-type label. HTTP status codes are shown in the Details cell. */
export function TypeBadge({
  statusCode,
  eventType,
}: {
  statusCode: number | null;
  eventType: string;
}) {
  if ((statusCode !== null && statusCode >= 500) || eventType === 'error')
    return (
      <Badge variant="destructive" className="text-[10px]">
        Error{statusCode ? ` · ${statusCode}` : ''}
      </Badge>
    );
  if (statusCode !== null && statusCode >= 400)
    return (
      <Badge
        variant="outline"
        className="border-amber-300 text-[10px] text-amber-700"
      >
        {statusCode}
      </Badge>
    );
  if (eventType === 'system_event')
    return (
      <Badge variant="secondary" className="text-[10px]">
        System
      </Badge>
    );
  if (eventType === 'auth_event')
    return (
      <Badge variant="outline" className="text-[10px]">
        Auth
      </Badge>
    );
  return null;
}

/** @deprecated use TypeBadge */
export const StatusBadge = TypeBadge;

/** All tabs — used in super-admin view which can see auth + system events. */
export const ADMIN_EVENT_TYPE_TABS = [
  { key: '', label: 'All' },
  { key: 'user_action', label: 'User Actions' },
  { key: 'auth_event', label: 'Auth Events' },
  { key: 'error', label: 'Errors' },
  { key: 'system_event', label: 'System' },
];

/**
 * Reduced tabs for assoc-admin view.
 * Auth Events and System are excluded: those events have association_id = null
 * and will never appear in the association-scoped query.
 */
export const ASSOC_EVENT_TYPE_TABS = [
  { key: '', label: 'All' },
  { key: 'user_action', label: 'User Actions' },
];

/** @deprecated use ADMIN_EVENT_TYPE_TABS or ASSOC_EVENT_TYPE_TABS */
export const EVENT_TYPE_TABS = ADMIN_EVENT_TYPE_TABS;

export function EventTypeTabs({
  eventType,
  tabHref,
  testPrefix = 'filter-tab',
  tabs = ADMIN_EVENT_TYPE_TABS,
}: {
  eventType: string;
  tabHref: (et: string) => string;
  testPrefix?: string;
  tabs?: typeof ADMIN_EVENT_TYPE_TABS;
}) {
  return (
    <div
      className="flex flex-wrap gap-1"
      role="tablist"
      aria-label="Filter by event type"
    >
      {tabs.map((tab) => {
        const isActive = eventType === tab.key;
        return (
          <a
            key={tab.key}
            href={tabHref(tab.key)}
            role="tab"
            aria-selected={isActive}
            data-test={`${testPrefix}-${tab.key || 'all'}`}
            className={cn(
              'inline-flex h-8 items-center rounded-full px-3 text-sm font-medium transition-colors',
              isActive
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:bg-muted/80',
            )}
          >
            {tab.label}
          </a>
        );
      })}
    </div>
  );
}

export function AuditSearchBar({
  defaultValue,
  basePath,
  eventType,
  testId = 'audit-search',
}: {
  defaultValue: string;
  basePath: string;
  eventType: string;
  testId?: string;
}) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [value, setValue] = useState(defaultValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const sp = new URLSearchParams();
      if (value.trim()) sp.set('search', value.trim());
      if (eventType) sp.set('eventType', eventType);
      const qs = sp.toString();
      routerRef.current.push(qs ? `${basePath}?${qs}` : basePath);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, basePath, eventType]);

  return (
    <div className="relative w-64">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search events, users, details…"
        className="border-input bg-background focus:ring-ring h-9 w-full rounded-md border py-1.5 pr-3 pl-8 text-sm focus:ring-2 focus:outline-none"
        data-test={testId}
      />
    </div>
  );
}
