'use client';

import { useEffect, useRef, useState } from 'react';

import { RefreshCw } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';

import { Button } from '@kit/ui/button';

import { syncIcalAction } from '../_lib/server/ical-sync-action';
import type { FeedSyncResult } from '~/lib/villa/ical-sync';

interface SyncIcalButtonProps {
  accountId: string;
  propertyId: string;
}

function syncLabel(feeds: FeedSyncResult[]): string {
  if (feeds.length === 0) return 'Sync done';

  const first = feeds[0]!;

  if (first.status === 'no_feeds') return 'No channels to sync';

  const ok = feeds.filter((f) => f.status === 'ok');
  const unchanged = feeds.filter((f) => f.status === 'unchanged');
  const failed = feeds.filter(
    (f) =>
      f.status !== 'ok' &&
      f.status !== 'unchanged' &&
      f.status !== 'no_feeds',
  );

  if (failed.length > 0) {
    return `${failed.length} channel${failed.length > 1 ? 's' : ''} failed`;
  }

  if (ok.length > 0) {
    const total = ok.reduce((s, f) => s + f.applied, 0);
    return total > 0 ? `Synced ${total} event${total !== 1 ? 's' : ''}` : 'Synced';
  }

  if (unchanged.length > 0) return 'Already up to date';

  return 'Sync done';
}

export function SyncIcalButton({ accountId, propertyId }: SyncIcalButtonProps) {
  const [label, setLabel] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  function resetLabelAfter(ms: number) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setLabel(null), ms);
  }

  const { execute, isPending } = useAction(syncIcalAction, {
    onSuccess: ({ data }) => {
      if (data) setLabel(syncLabel(data.feeds));
      resetLabelAfter(4000);
    },
    onError: () => {
      setLabel('Sync failed');
      resetLabelAfter(4000);
    },
  });

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      data-test="villa-calendar-sync-ical"
      onClick={() => execute({ accountId, propertyId })}
    >
      <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
      <span>{label ?? (isPending ? 'Syncing…' : 'Sync channels')}</span>
    </Button>
  );
}
