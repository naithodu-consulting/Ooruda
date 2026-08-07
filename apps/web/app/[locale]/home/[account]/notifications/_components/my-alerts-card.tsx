'use client';

import { useState, useTransition } from 'react';

import Link from 'next/link';

import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  Bell,
  CheckCheck,
  Info,
  TriangleAlert,
} from 'lucide-react';

import { useSupabase } from '@kit/supabase/hooks/use-supabase';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { cn } from '@kit/ui/utils';

type AlertType = 'info' | 'warning' | 'error';

interface AlertRow {
  id: number;
  type: AlertType | string;
  body: string;
  link: string | null;
  dismissed: boolean;
  created_at: string;
}

function AlertIcon({ type }: { type: string }) {
  if (type === 'warning')
    return <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />;
  if (type === 'error')
    return <AlertCircle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />;
  return <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />;
}

// Parse bold markdown **title**\nbody format written by notify.ts
function parseAlertBody(body: string): { title: string; text: string } {
  const newlineIdx = body.indexOf('\n');
  const match = body.match(/^\*\*(.+?)\*\*/);
  if (match) {
    const title = match[1]!;
    const text = newlineIdx > -1 ? body.slice(newlineIdx + 1).trim() : '';
    return { title, text };
  }
  return { title: '', text: body };
}

export function MyAlertsCard({
  alerts: initialAlerts,
}: {
  alerts: AlertRow[];
}) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [pending, startTransition] = useTransition();
  const supabase = useSupabase();

  function dismiss(id: number) {
    startTransition(async () => {
      await supabase
        .from('notifications')
        .update({ dismissed: true })
        .eq('id', id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    });
  }

  function dismissAll() {
    startTransition(async () => {
      const ids = alerts.map((a) => a.id);
      await supabase
        .from('notifications')
        .update({ dismissed: true })
        .in('id', ids);
      setAlerts([]);
    });
  }

  if (alerts.length === 0) {
    return (
      <Card className="bg-card">
        <CardContent className="flex flex-col items-center gap-3 py-12">
          <Bell className="text-muted-foreground/40 h-10 w-10" />
          <p className="text-muted-foreground text-sm">
            You're all caught up — no new alerts.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base">My Alerts</CardTitle>
          <CardDescription>
            {alerts.length} unread notification{alerts.length === 1 ? '' : 's'}
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          data-test="dismiss-all-alerts"
          onClick={dismissAll}
        >
          <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
          Mark all read
        </Button>
      </CardHeader>

      <CardContent className="space-y-2 pt-0">
        {alerts.map((alert) => {
          const { title, text } = parseAlertBody(alert.body);
          const Content = (
            <div
              className={cn(
                'flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors',
                alert.type === 'warning' &&
                  'border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20',
                alert.type === 'error' &&
                  'border-destructive/20 bg-destructive/5',
                alert.type === 'info' &&
                  'border-blue-200 bg-blue-50/60 dark:border-blue-900/40 dark:bg-blue-950/20',
              )}
            >
              <AlertIcon type={alert.type} />
              <div className="min-w-0 flex-1">
                {title && (
                  <p className="text-foreground text-sm leading-snug font-semibold">
                    {title}
                  </p>
                )}
                {text && (
                  <p className="text-muted-foreground mt-0.5 text-sm leading-snug">
                    {text}
                  </p>
                )}
                <p className="text-muted-foreground/70 mt-1 text-xs">
                  {formatDistanceToNow(new Date(alert.created_at), {
                    addSuffix: true,
                  })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground shrink-0"
                disabled={pending}
                data-test={`dismiss-alert-${alert.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dismiss(alert.id);
                }}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span className="sr-only">Dismiss</span>
              </Button>
            </div>
          );

          return alert.link ? (
            <Link
              key={alert.id}
              href={alert.link}
              className="block hover:no-underline"
            >
              {Content}
            </Link>
          ) : (
            <div key={alert.id}>{Content}</div>
          );
        })}
      </CardContent>
    </Card>
  );
}
