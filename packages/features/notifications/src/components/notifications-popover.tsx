'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  AlertTriangle,
  Bell,
  CircleAlert,
  CircleDollarSign,
  Clock,
  FileText,
  Trash2,
  XIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@kit/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@kit/ui/popover';
import { Separator } from '@kit/ui/separator';
import { cn } from '@kit/ui/utils';

import { useDismissNotification, useFetchNotifications } from '../hooks';
import { Notification } from '../types';

// Parse **title**\nbody format written by notify.ts
function parseBody(raw: string): { title: string; text: string } {
  const match = raw.match(/^\*\*(.+?)\*\*/);
  if (match) {
    const title = match[1]!;
    const newlineIdx = raw.indexOf('\n');
    const text = newlineIdx > -1 ? raw.slice(newlineIdx + 1).trim() : '';
    return { title, text };
  }
  return { title: '', text: raw };
}

function getDestination(
  notification: Notification,
  accountSlug: string,
): string | null {
  if (!accountSlug) return notification.link ?? null;
  const { title } = parseBody(notification.body ?? '');
  if (title.startsWith('Payment Received'))
    return `/home/${accountSlug}/statement`;
  if (
    title.startsWith('Bill') ||
    title.startsWith('Reminder') ||
    title.startsWith('Overdue')
  )
    return `/home/${accountSlug}`;
  return notification.link ?? null;
}

function NotifIcon({ type, title }: { type: string; title: string }) {
  if (type === 'error')
    return <CircleAlert className="text-destructive mt-0.5 h-4 w-4 shrink-0" />;
  if (type === 'warning')
    return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />;
  if (title.startsWith('Payment'))
    return (
      <CircleDollarSign className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
    );
  if (title.startsWith('Bill Generated') || title.startsWith('Bill'))
    return <FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />;
  if (title.startsWith('Reminder'))
    return <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />;
  if (title.startsWith('Overdue'))
    return (
      <AlertTriangle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
    );
  return <Bell className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />;
}

function NotifBadge({ count }: { count: number }) {
  if (count === 0) return null;
  const label = count > 9 ? '9+' : String(count);
  return (
    <span
      className={cn(
        'fade-in animate-in zoom-in absolute top-0.5 right-0.5 flex min-h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] leading-none font-semibold text-white',
      )}
    >
      {label}
    </span>
  );
}

export function NotificationsPopover(params: {
  realtime: boolean;
  accountIds: string[];
  accountSlug: string;
  onClick?: (notification: Notification) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();

  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dismissing, setDismissing] = useState<Set<number>>(new Set());

  const onNotifications = useCallback((incoming: Notification[]) => {
    setNotifications((existing) => {
      const seen = new Set(existing.map((n) => n.id));
      const fresh = incoming.filter((n) => !seen.has(n.id));
      return [...fresh, ...existing];
    });
  }, []);

  const dismissNotification = useDismissNotification();

  useFetchNotifications({
    onNotifications,
    accountIds: params.accountIds,
    realtime: params.realtime,
  });

  useEffect(() => {
    return () => setNotifications([]);
  }, []);

  function dismiss(id: number) {
    setDismissing((prev) => {
      const s = new Set(prev);
      s.add(id);
      return s;
    });
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setDismissing((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
    }, 220);
    dismissNotification(id).catch(() => null);
  }

  function dismissAll() {
    const ids = notifications.map((n) => n.id);
    ids.forEach((id) => {
      setDismissing((prev) => {
        const s = new Set(prev);
        s.add(id);
        return s;
      });
    });
    setTimeout(() => {
      setNotifications([]);
      setDismissing(new Set());
    }, 220);
    ids.forEach((id) => dismissNotification(id).catch(() => null));
  }

  const timeAgo = (createdAt: string) => {
    const date = new Date(createdAt);
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);

    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

    if (diffMin < 1) return t('common.justNow');
    if (diffMin < 60) return formatter.format(-diffMin, 'minute');

    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return formatter.format(-diffHr, 'hour');

    const diffDay = Math.floor(diffHr / 24);
    if (diffDay <= 30) return formatter.format(-diffDay, 'day');

    const diffMonth = Math.floor(diffDay / 30);
    if (diffMonth <= 12) return formatter.format(-diffMonth, 'month');

    return formatter.format(-Math.floor(diffMonth / 12), 'year');
  };

  const count = notifications.filter((n) => !dismissing.has(n.id)).length;

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button size="icon-lg" variant="ghost" className="relative" />}
      >
        <Bell className="size-4 min-h-3 min-w-3" />
        <NotifBadge count={count} />
      </PopoverTrigger>

      <PopoverContent
        className="flex w-[min(calc(100vw-2rem),24rem)] flex-col gap-0 overflow-hidden p-0"
        align="end"
        alignOffset={-8}
        sideOffset={10}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">
              {t('common.notifications')}
            </span>
            {count > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-100 px-1.5 text-[10px] font-semibold text-red-600">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </div>

          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground h-auto px-2 py-1 text-xs"
              onClick={dismissAll}
              data-test="clear-all-notifications"
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Clear
            </Button>
          )}
        </div>

        <Separator />

        {/* List */}
        <div className="max-h-[min(60vh,24rem)] overflow-y-auto">
          {count === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-full">
                <Bell className="text-muted-foreground h-5 w-5" />
              </div>
              <p className="text-muted-foreground text-sm">
                {t('common.noNotifications')}
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((notification) => {
                const { title, text } = parseBody(notification.body ?? '');

                const rowContent = (
                  <li
                    key={notification.id}
                    className={cn(
                      'group relative flex items-start gap-3 px-4 py-3 transition-colors',
                      'hover:bg-muted/50',
                    )}
                    onClick={() => params.onClick?.(notification)}
                  >
                    {/* Unread dot */}
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />

                    <NotifIcon
                      type={notification.type ?? 'info'}
                      title={title}
                    />

                    <div className="min-w-0 flex-1">
                      {title ? (
                        <>
                          <p className="text-foreground text-sm leading-snug font-semibold">
                            {title}
                          </p>
                          {text && (
                            <p className="text-muted-foreground mt-0.5 text-sm leading-snug">
                              {text}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-foreground text-sm leading-snug">
                          {text}
                        </p>
                      )}
                      <p className="text-muted-foreground/70 mt-1 text-xs">
                        {timeAgo(notification.created_at)}
                      </p>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-foreground h-6 w-6 shrink-0 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        dismiss(notification.id);
                      }}
                      data-test={`dismiss-notification-${notification.id}`}
                    >
                      <XIcon className="h-3.5 w-3.5" />
                      <span className="sr-only">Dismiss</span>
                    </Button>
                  </li>
                );

                const isDismissing = dismissing.has(notification.id);

                const dest = getDestination(notification, params.accountSlug);

                return (
                  <div
                    key={notification.id}
                    className={cn(
                      'overflow-hidden transition-all duration-200 ease-out',
                      isDismissing
                        ? 'max-h-0 opacity-0'
                        : 'max-h-40 opacity-100',
                    )}
                  >
                    {dest ? (
                      <a
                        href={dest}
                        className="block hover:no-underline"
                        onClick={() => dismiss(notification.id)}
                      >
                        {rowContent}
                      </a>
                    ) : (
                      <div onClick={() => dismiss(notification.id)}>
                        {rowContent}
                      </div>
                    )}
                  </div>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <Separator />
        <div className="px-4 py-2.5">
          <a
            href={`/home/${params.accountSlug}/notifications`}
            className="text-muted-foreground hover:text-foreground flex items-center justify-center text-xs transition-colors"
            onClick={() => setOpen(false)}
          >
            View all notifications
          </a>
        </div>
      </PopoverContent>
    </Popover>
  );
}
