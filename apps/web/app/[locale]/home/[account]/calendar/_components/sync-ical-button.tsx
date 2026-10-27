'use client';

import { useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { RefreshCw } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';

import { Button } from '@kit/ui/button';
import { toast } from '@kit/ui/sonner';

import type { FeedSyncResult } from '~/lib/villa/ical-sync';

import { syncIcalAction } from '../_lib/server/ical-sync-action';

interface SyncIcalButtonProps {
  accountId: string;
  propertyId: string;
  lastSyncedAt?: string | null;
  lastStatus?: string | null;
}

function formatSyncedTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

function summarizeSync(feeds: FeedSyncResult[]): {
  buttonLabel: string;
  tone: 'success' | 'warning' | 'error';
  toastMessage: string;
} {
  if (feeds.length === 0) {
    return {
      buttonLabel: 'Synced',
      tone: 'success',
      toastMessage: 'Airbnb calendar synced.',
    };
  }

  const first = feeds[0]!;

  if (first.status === 'no_feeds') {
    return {
      buttonLabel: 'No feed configured',
      tone: 'success',
      toastMessage: 'No active Airbnb calendar feed is configured.',
    };
  }

  const ok = feeds.filter((f) => f.status === 'ok');
  const unchanged = feeds.filter((f) => f.status === 'unchanged');
  const held = feeds.filter((f) => f.status === 'held_for_review');
  const failed = feeds.filter(
    (f) =>
      f.status !== 'ok' && f.status !== 'unchanged' && f.status !== 'no_feeds',
  );

  if (held.length > 0) {
    return {
      buttonLabel: 'Held for review',
      tone: 'error',
      toastMessage:
        'Airbnb calendar has an unusually long block and was held for review.',
    };
  }

  if (failed.length > 0) {
    return {
      buttonLabel: 'Could not sync',
      tone: 'error',
      toastMessage:
        'Could not sync Airbnb calendar right now. Please try again in a moment.',
    };
  }

  const totalConflicts = feeds.reduce((s, f) => s + f.conflictsCount, 0);
  if (totalConflicts > 0) {
    return {
      buttonLabel: `${totalConflicts} conflict${totalConflicts !== 1 ? 's' : ''} found`,
      tone: 'warning',
      toastMessage: `Airbnb blocked ${totalConflicts} stay${totalConflicts !== 1 ? 's' : ''} that clash with confirmed bookings. Please review immediately.`,
    };
  }

  if (ok.length > 0) {
    const totalApplied = ok.reduce((s, f) => s + f.applied, 0);
    const totalRemoved = ok.reduce((s, f) => s + f.removed, 0);
    return {
      buttonLabel:
        totalApplied > 0
          ? `Synced (${totalApplied} block${totalApplied !== 1 ? 's' : ''})`
          : 'Synced',
      tone: 'success',
      toastMessage:
        totalApplied > 0 || totalRemoved > 0
          ? `Airbnb calendar synced (${totalApplied} active block${totalApplied !== 1 ? 's' : ''}).`
          : 'Airbnb calendar synced.',
    };
  }

  if (unchanged.length > 0) {
    return {
      buttonLabel: 'Up to date',
      tone: 'success',
      toastMessage: 'Airbnb calendar is already up to date.',
    };
  }

  return {
    buttonLabel: 'Synced',
    tone: 'success',
    toastMessage: 'Airbnb calendar synced.',
  };
}

export function SyncIcalButton({
  accountId,
  propertyId,
  lastSyncedAt,
  lastStatus,
}: SyncIcalButtonProps) {
  const router = useRouter();
  const [label, setLabel] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(lastSyncedAt ?? null);
  const [status, setStatus] = useState<string | null>(lastStatus ?? null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSyncedAt(lastSyncedAt ?? null);
    setStatus(lastStatus ?? null);
  }, [lastSyncedAt, lastStatus]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function resetLabelAfter(ms: number) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setLabel(null), ms);
  }

  const { execute, isPending } = useAction(syncIcalAction, {
    onSuccess: ({ data }) => {
      if (data) {
        const summary = summarizeSync(data.feeds);
        setLabel(summary.buttonLabel);
        if (summary.tone === 'error') {
          setStatus('error');
          setSyncedAt(null);
          toast.error(summary.toastMessage);
        } else if (summary.tone === 'warning') {
          setSyncedAt(data.syncedAt);
          setStatus('ok');
          toast.warning(summary.toastMessage);
          router.refresh();
        } else {
          setSyncedAt(data.syncedAt);
          setStatus('ok');
          toast.success(summary.toastMessage);
          router.refresh();
        }
      }
      resetLabelAfter(4000);
    },
    onError: () => {
      setLabel('Could not sync');
      setStatus('error');
      setSyncedAt(null);
      toast.error(
        'Could not sync Airbnb calendar right now. Please try again in a moment.',
      );
      resetLabelAfter(4000);
    },
  });

  const formattedTime = formatSyncedTime(syncedAt);
  const hasFailed = status && status !== 'ok';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasFailed ? (
        <span
          className="text-muted-foreground text-xs"
          data-test="villa-calendar-sync-status"
        >
          Last sync failed
        </span>
      ) : formattedTime ? (
        <span
          className="text-muted-foreground text-xs"
          data-test="villa-calendar-sync-status"
        >
          {`Synced ${formattedTime}`}
        </span>
      ) : null}

      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        data-test="villa-calendar-sync-ical"
        onClick={() => execute({ accountId, propertyId })}
      >
        <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
        <span>{label ?? (isPending ? 'Syncing…' : 'Sync Airbnb')}</span>
      </Button>
    </div>
  );
}
