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
  tone: 'success' | 'info' | 'warning' | 'error';
  toastMessage: string;
} {
  if (feeds.length === 0) {
    return {
      buttonLabel: 'Up to date',
      tone: 'success',
      toastMessage: 'Airbnb calendar is up to date.',
    };
  }

  const first = feeds[0]!;

  // Nothing was synced because there is nothing to sync from. A green tick
  // beside that sentence read as "it worked", which is what confused people:
  // this is a setup gap, so it is said plainly and points at the fix.
  if (first.status === 'no_feeds') {
    return {
      buttonLabel: 'No calendar linked',
      tone: 'info',
      toastMessage:
        'Nothing to sync yet - no Airbnb calendar is linked to this villa. Add the Airbnb calendar link in Villa Settings.',
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
      buttonLabel: 'Needs a check',
      tone: 'error',
      toastMessage:
        'Airbnb sent an unusually long block, so nothing was changed. Check your Airbnb calendar, then sync again.',
    };
  }

  if (failed.length > 0) {
    return {
      buttonLabel: 'Could not sync',
      tone: 'error',
      toastMessage:
        'Could not reach the Airbnb calendar. Nothing was changed - please try again in a few minutes.',
    };
  }

  const totalConflicts = feeds.reduce((s, f) => s + f.conflictsCount, 0);
  if (totalConflicts > 0) {
    const d = totalConflicts === 1 ? 'date' : 'dates';
    return {
      buttonLabel: `${totalConflicts} clash${totalConflicts === 1 ? '' : 'es'}`,
      tone: 'warning',
      toastMessage: `Airbnb has blocked ${totalConflicts} ${d} you already have a confirmed booking for. Please check these ${d} now.`,
    };
  }

  if (ok.length > 0) {
    const applied = ok.reduce((s, f) => s + f.applied, 0);
    const removed = ok.reduce((s, f) => s + f.removed, 0);

    if (applied === 0 && removed === 0) {
      return {
        buttonLabel: 'Up to date',
        tone: 'success',
        toastMessage: 'Airbnb calendar is up to date. Nothing changed.',
      };
    }

    const parts: string[] = [];
    if (applied > 0) {
      parts.push(`${applied} date${applied === 1 ? '' : 's'} blocked`);
    }
    if (removed > 0) {
      parts.push(`${removed} date${removed === 1 ? '' : 's'} freed`);
    }

    return {
      buttonLabel: 'Calendar updated',
      tone: 'success',
      toastMessage: `Airbnb calendar synced - ${parts.join(', ')}.`,
    };
  }

  if (unchanged.length > 0) {
    return {
      buttonLabel: 'Up to date',
      tone: 'success',
      toastMessage: 'Airbnb calendar is up to date. Nothing changed.',
    };
  }

  return {
    buttonLabel: 'Up to date',
    tone: 'success',
    toastMessage: 'Airbnb calendar is up to date.',
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
        } else if (summary.tone === 'info') {
          // No feed to read: the villa's last sync state is unchanged, so
          // neither a tick nor a failure is claimed here.
          toast.info(summary.toastMessage);
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
        'Could not reach the Airbnb calendar. Nothing was changed - please try again in a few minutes.',
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
