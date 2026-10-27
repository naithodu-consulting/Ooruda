import 'server-only';

import { getLogger } from '@kit/shared/logger';

import type { VillaSite } from '~/lib/villa-db/client';

/**
 * iCal feed sync for Ooruda.
 *
 * Ported from villa-booking/src/lib/ical.ts and ical-sync.ts. The parsing is
 * hand-written (no extra dependency) because the grammar we need is just
 * VEVENT UID/DTSTART/DTEND/SUMMARY. The sync follows the same
 * fetch → parse → classify → apply order as villa-booking's cron.
 */

// ── Parsing ──────────────────────────────────────────────────────────────────

interface IcalEvent {
  uid: string;
  summary: string;
  start: string;
  end: string;
}

function unfold(body: string): string[] {
  return body
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
}

function toISODate(raw: string): string | null {
  const value = raw.trim().split('T')[0] ?? '';
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== iso
  )
    return null;
  return iso;
}

function splitProperty(line: string): { name: string; value: string } | null {
  const colon = line.indexOf(':');
  if (colon < 1) return null;
  return {
    name: line.slice(0, colon).split(';')[0]!.trim().toUpperCase(),
    value: line.slice(colon + 1),
  };
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function parseIcal(body: string): IcalEvent[] {
  if (!body.trimStart().startsWith('BEGIN:VCALENDAR')) {
    throw new Error('Body is not an iCalendar document.');
  }

  const events: IcalEvent[] = [];
  let current: Partial<IcalEvent> | null = null;

  for (const line of unfold(body)) {
    const trimmed = line.trim();

    if (trimmed === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (trimmed === 'END:VEVENT') {
      if (current) {
        if (current.start) {
          const end = current.end ?? addDays(current.start, 1);
          if (end > current.start) {
            events.push({
              uid: current.uid ?? '',
              summary: current.summary ?? '',
              start: current.start,
              end,
            });
          }
        }
      }
      current = null;
      continue;
    }

    if (!current) continue;

    const prop = splitProperty(trimmed);
    if (!prop) continue;

    switch (prop.name) {
      case 'UID':
        current.uid = prop.value.trim();
        break;
      case 'SUMMARY':
        current.summary = prop.value.trim();
        break;
      case 'DTSTART':
        current.start = toISODate(prop.value) ?? undefined;
        break;
      case 'DTEND':
        current.end = toISODate(prop.value) ?? undefined;
        break;
    }
  }

  return events;
}

function nightsBetween(start: string, end: string): number {
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
      86_400_000,
  );
}

function eventSetFingerprint(events: IcalEvent[]): string {
  return events
    .map((e) => `${e.start}/${e.end}/${e.uid}`)
    .sort()
    .join('|');
}

function classifyEvents(
  events: IcalEvent[],
  today: string,
): { apply: IcalEvent[]; dropped: number; heldForReview: boolean } {
  const horizonDays = 300;
  const maxSpanNights = 90;
  const maxTotalNights = 120;
  const horizon = addDays(today, horizonDays);

  const apply: IcalEvent[] = [];
  let dropped = 0;
  const reviewReasons: string[] = [];

  for (const event of events) {
    const nights = nightsBetween(event.start, event.end);
    if (event.end <= today) {
      dropped++;
      continue;
    }
    if (event.end >= horizon && nights > maxSpanNights) {
      dropped++;
      continue;
    }
    if (nights > maxSpanNights) {
      reviewReasons.push(
        `Event ${event.start}→${event.end} holds ${nights} nights (limit ${maxSpanNights}).`,
      );
      dropped++;
      continue;
    }
    apply.push(event);
  }

  const totalNights = apply.reduce(
    (sum, e) => sum + nightsBetween(e.start, e.end),
    0,
  );
  if (totalNights > maxTotalNights) {
    reviewReasons.push(
      `Feed would block ${totalNights} nights in total (limit ${maxTotalNights}).`,
    );
  }

  return {
    apply,
    dropped,
    heldForReview: reviewReasons.length > 0,
  };
}

// ── Sync ─────────────────────────────────────────────────────────────────────

export type FeedSyncStatus =
  | 'ok'
  | 'unchanged'
  | 'fetch_failed'
  | 'parse_failed'
  | 'apply_failed'
  | 'held_for_review'
  | 'no_feeds';

export interface FeedSyncResult {
  feedName: string;
  status: FeedSyncStatus;
  applied: number;
  removed: number;
  error?: string;
}

export interface SyncNowResult {
  feeds: FeedSyncResult[];
}

/** Sync all active iCal feeds for a villa property. */
export async function syncIcalFeeds(site: VillaSite): Promise<SyncNowResult> {
  const logger = await getLogger();

  const { data: feedRows, error: feedsError } = await site.client
    .from('ical_feeds')
    .select('id, property_id, name, url, last_fingerprint')
    .eq('property_id', site.sitePropertyId)
    .eq('is_active', true)
    .order('name');

  if (feedsError) throw feedsError;

  const feeds = feedRows ?? [];

  if (feeds.length === 0) {
    return { feeds: [{ feedName: '', status: 'no_feeds', applied: 0, removed: 0 }] };
  }

  const results: FeedSyncResult[] = [];

  for (const feed of feeds) {
    const base = { feedName: feed.name, applied: 0, removed: 0 };

    // Fetch
    let body: string;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      let resp: Response;
      try {
        resp = await fetch(feed.url, {
          signal: controller.signal,
          credentials: 'omit',
          redirect: 'error',
          headers: { Accept: 'text/calendar, text/plain;q=0.5' },
          cache: 'no-store',
        });
      } finally {
        clearTimeout(timer);
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      body = await resp.text();
      if (!body) throw new Error('Empty response');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ feed: feed.name, error: msg }, 'ical sync: fetch failed');
      await site.client.rpc('record_ical_failure', {
        p_feed_id: feed.id,
        p_status: 'fetch_failed',
        p_error: msg,
      });
      results.push({ ...base, status: 'fetch_failed', error: msg });
      continue;
    }

    // Parse
    let events: IcalEvent[];
    try {
      events = parseIcal(body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ feed: feed.name, error: msg }, 'ical sync: parse failed');
      await site.client.rpc('record_ical_failure', {
        p_feed_id: feed.id,
        p_status: 'parse_failed',
        p_error: msg,
      });
      results.push({ ...base, status: 'parse_failed', error: msg });
      continue;
    }

    const fingerprint = eventSetFingerprint(events);
    const today = new Date().toISOString().slice(0, 10);
    const classified = classifyEvents(events, today);

    if (classified.heldForReview) {
      const msg = 'Feed has unusually long events held for review.';
      await site.client.rpc('record_ical_failure', {
        p_feed_id: feed.id,
        p_status: 'held_for_review',
        p_error: msg,
      });
      results.push({ ...base, status: 'held_for_review', error: msg });
      continue;
    }

    // Fingerprint check
    if (feed.last_fingerprint && feed.last_fingerprint === fingerprint) {
      // Still update last_synced_at
      await site.client.rpc('record_ical_failure', {
        p_feed_id: feed.id,
        p_status: 'ok',
        p_error: '',
      });
      results.push({ ...base, status: 'unchanged' });
      continue;
    }

    // Apply
    const label = `${feed.name} Booking`;
    const payload = classified.apply.map((e) => ({
      start: e.start,
      end: e.end,
      uid: e.uid,
      summary: label,
    }));

    const { data, error: applyError } = await site.client.rpc('apply_ical_feed', {
      p_feed_id: feed.id,
      p_events: payload,
      p_fingerprint: fingerprint,
    });

    if (applyError) {
      logger.error(
        { feed: feed.name, error: applyError.message },
        'ical sync: apply failed',
      );
      results.push({ ...base, status: 'apply_failed', error: applyError.message });
      continue;
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      | { removed: number; inserted: number }
      | null;

    results.push({
      ...base,
      status: 'ok',
      applied: row?.inserted ?? 0,
      removed: row?.removed ?? 0,
    });
  }

  return { feeds: results };
}
