import 'server-only';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import { invalidateBlocksCache } from '~/lib/villa-db/blocks';
import {
  listChannelLinkedBookings,
  relinkChannelBooking,
} from '~/lib/villa-db/bookings';
import type { VillaSite } from '~/lib/villa-db/client';
import { addDays, todayIst } from '~/lib/villa-db/dates';
import { logSync } from '~/lib/villa-db/sync-log';
import { linkChannelStays } from '~/lib/villa/channel-link';
import { sendVillaEmail } from '~/lib/villa/guest-mailer';
import { revalidateBookingSite } from '~/lib/villa/revalidate-site';

/**
 * iCal feed sync for Ooruda.
 *
 * Ported from villa-booking/src/lib/ical-fetch.ts, ical.ts and ical-sync.ts.
 * The parsing is hand-written (no extra dependency) because the grammar we need
 * is just VEVENT UID/DTSTART/DTEND/SUMMARY.
 *
 * The sync follows the exact same order of operations as villa-booking's cron:
 *   fetch → parse → classify → check conflicts → apply → revalidate
 *
 * Every step before `apply_ical_feed` aborts cleanly if anything is wrong,
 * leaving `blocked_dates` untouched. Raw error strings and feed URLs never
 * leave the server: every run is recorded in `ical_feeds`, `villa_sync_log`,
 * and structured server logs with redacted URLs.
 */

const FETCH_TIMEOUT_MS = 10_000;
const FETCH_MAX_BYTES = 1_000_000;

// ── Fetch & URL Redaction ────────────────────────────────────────────────────

export class IcalFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IcalFetchError';
  }
}

export class IcalParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IcalParseError';
  }
}

/**
 * Strips the credential query/hash from a feed URL so it can safely appear in
 * a server log or database diagnostic column.
 *
 * Airbnb's link carries its secret in `?s=` / `?t=`, and the whole URL is
 * effectively a bearer token: anyone holding it can read the villa's occupancy.
 */
export function redactFeedUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '[unparseable feed url]';
  }
}

export async function fetchIcal(url: string): Promise<{
  body: string;
  bytes: number;
  status: number;
}> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new IcalFetchError('Feed URL is not a URL.');
  }

  if (parsed.protocol !== 'https:') {
    throw new IcalFetchError('Feed URL must be https.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(parsed, {
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'error',
      headers: { Accept: 'text/calendar, text/plain;q=0.5' },
      cache: 'no-store',
    });
  } catch (err) {
    const reason =
      err instanceof Error && err.name === 'AbortError'
        ? `no response in ${FETCH_TIMEOUT_MS / 1000}s`
        : 'network error';
    throw new IcalFetchError(`Could not reach the feed: ${reason}.`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new IcalFetchError(`Feed returned HTTP ${response.status}.`);
  }

  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > FETCH_MAX_BYTES) {
    throw new IcalFetchError(
      `Feed is ${declared} bytes, over the ${FETCH_MAX_BYTES} limit.`,
    );
  }

  const body = await response.text();
  const bytes = Buffer.byteLength(body, 'utf8');
  if (bytes > FETCH_MAX_BYTES) {
    throw new IcalFetchError(
      `Feed is ${bytes} bytes, over the ${FETCH_MAX_BYTES} limit.`,
    );
  }
  if (bytes === 0) {
    throw new IcalFetchError('Feed returned an empty body.');
  }

  return { body, bytes, status: response.status };
}

// ── Parsing & Classification ─────────────────────────────────────────────────

export interface IcalEvent {
  uid: string;
  summary: string;
  /** Raw DESCRIPTION, unescaped. Empty when the feed carries none. */
  description: string;
  /** First night held, YYYY-MM-DD. */
  start: string;
  /** Checkout day, YYYY-MM-DD, exclusive. */
  end: string;
}

/**
 * What a channel's calendar entry actually tells us about the stay.
 *
 * Airbnb's export is deliberately thin: SUMMARY is `Reserved` for a guest
 * reservation and `Airbnb (Not available)` for a block the host made on
 * Airbnb itself, and DESCRIPTION — when present — carries only the
 * reservation URL (which ends in the confirmation code) and the last four
 * digits of the guest's phone. There is never a name, an email or an amount,
 * so this is the ceiling of what iCal can give us.
 */
export interface ChannelEventDetails {
  /** 'block' = the host closed these nights on the channel, not a guest. */
  kind: 'reservation' | 'block';
  /** Airbnb confirmation code, e.g. HM5XK3J9QW. */
  confirmationCode: string | null;
  /** Last four digits of the guest's phone, as the channel gives them. */
  phoneLast4: string | null;
}

/** `\n`, `\,` and friends are escapes in an iCal text value (RFC 5545 §3.3.11). */
function unescapeText(value: string): string {
  return value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
}

const CONFIRMATION_CODE = /\b([A-Z0-9]{6,20})\b/;

/**
 * Reads what little a channel event says about the stay. Pure, and tolerant:
 * a feed that changes its wording loses the extra detail and still syncs,
 * because every field is optional and nothing here can throw.
 */
export function channelEventDetails(event: {
  summary: string;
  description: string;
}): ChannelEventDetails {
  const summary = event.summary.toLowerCase();
  const description = event.description;

  // "Airbnb (Not available)", "Not available", "Blocked" — the host's own
  // hold on the channel, not a guest. Only "reserved"/a reservation URL
  // means money changed hands somewhere.
  const kind: ChannelEventDetails['kind'] =
    summary.includes('not available') || summary.includes('blocked')
      ? 'block'
      : 'reservation';

  const urlMatch =
    /reservations?\/details\/([A-Z0-9]+)/i.exec(description) ??
    /\/hosting\/reservations\/([A-Z0-9]+)/i.exec(description);

  let confirmationCode = urlMatch?.[1]?.toUpperCase() ?? null;

  if (!confirmationCode) {
    const line = /^\s*(?:confirmation\s*code|reservation)\s*:\s*(.+)$/im.exec(
      description,
    );
    confirmationCode =
      CONFIRMATION_CODE.exec(line?.[1]?.toUpperCase() ?? '')?.[1] ?? null;
  }

  const phoneMatch =
    /phone\s*(?:number)?\s*\(last\s*4\s*digits\)\s*:?\s*\(?(\d{4})/i.exec(
      description,
    ) ?? /last\s*4\s*digits\s*:?\s*\(?(\d{4})/i.exec(description);

  return {
    kind,
    confirmationCode,
    phoneLast4: phoneMatch?.[1] ?? null,
  };
}

/**
 * The operator-facing note stored on the block, and read back by Ooruda's
 * screens (`parseChannelNote` in ~/lib/villa/channel-note).
 *
 * It is a plain sentence on purpose: the booking site's own admin shows this
 * column too, and a JSON blob there would be unreadable.
 */
export function channelBlockNote(
  channel: string,
  details: ChannelEventDetails,
): string {
  const parts = [channel];

  parts.push(details.kind === 'block' ? 'blocked on channel' : 'booking');

  // Labelled, so reading it back cannot confuse it with the channel's own
  // name: an unlabelled all-caps segment is ambiguous (see parseChannelNote).
  if (details.confirmationCode) parts.push(`code ${details.confirmationCode}`);
  if (details.phoneLast4) parts.push(`phone ending ${details.phoneLast4}`);

  return parts.join(' · ');
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
  ) {
    return null;
  }
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

export function parseIcal(body: string): {
  events: IcalEvent[];
  skipped: number;
} {
  if (!body.trimStart().startsWith('BEGIN:VCALENDAR')) {
    throw new IcalParseError('Body is not an iCalendar document.');
  }

  const events: IcalEvent[] = [];
  let skipped = 0;
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
              description: current.description ?? '',
              start: current.start,
              end,
            });
          } else {
            skipped++;
          }
        } else {
          skipped++;
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
        current.summary = unescapeText(prop.value).trim();
        break;
      case 'DESCRIPTION':
        current.description = unescapeText(prop.value).trim();
        break;
      case 'DTSTART':
        current.start = toISODate(prop.value) ?? undefined;
        break;
      case 'DTEND':
        current.end = toISODate(prop.value) ?? undefined;
        break;
      default:
        break;
    }
  }

  return { events, skipped };
}

export function nightsBetween(start: string, end: string): number {
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
      86_400_000,
  );
}

/**
 * What we read from the event is included as well as its dates, because it is
 * what we store: a dates-only fingerprint called a feed "unchanged" while its
 * rows still held notes written by older code, so they were never corrected.
 * Must match villa-booking's `eventSetFingerprint` (src/lib/ical.ts): both write
 * `last_fingerprint`, and a difference makes each sync rewrite the other's.
 */
export function eventSetFingerprint(events: IcalEvent[]): string {
  return events
    .map((e) => {
      const { kind, confirmationCode, phoneLast4 } = channelEventDetails(e);
      return `${e.start}/${e.end}/${e.uid}/${kind}/${confirmationCode ?? ''}/${phoneLast4 ?? ''}`;
    })
    .sort()
    .join('|');
}

export type DropReason = 'past' | 'window_edge' | 'too_long';

export interface DroppedEvent {
  event: IcalEvent;
  reason: DropReason;
  nights: number;
}

export interface Classification {
  apply: IcalEvent[];
  dropped: DroppedEvent[];
  totalNights: number;
  heldForReview: boolean;
  reviewReasons: string[];
}

export interface ClassifyOptions {
  today?: string;
  horizonDays?: number;
  maxSpanNights?: number;
  maxTotalNights?: number;
}

export function classifyEvents(
  events: IcalEvent[],
  options: ClassifyOptions = {},
): Classification {
  const today = options.today ?? todayIst();
  const horizonDays = options.horizonDays ?? 300;
  const maxSpanNights = options.maxSpanNights ?? 90;
  const maxTotalNights = options.maxTotalNights ?? 120;
  const horizon = addDays(today, horizonDays);

  const apply: IcalEvent[] = [];
  const dropped: DroppedEvent[] = [];
  const reviewReasons: string[] = [];

  for (const event of events) {
    const nights = nightsBetween(event.start, event.end);

    if (event.end <= today) {
      dropped.push({ event, reason: 'past', nights });
      continue;
    }

    if (event.end >= horizon && nights > maxSpanNights) {
      dropped.push({ event, reason: 'window_edge', nights });
      continue;
    }

    if (nights > maxSpanNights) {
      dropped.push({ event, reason: 'too_long', nights });
      reviewReasons.push(
        `Event ${event.start} to ${event.end} holds ${nights} nights (limit ${maxSpanNights}).`,
      );
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
    totalNights,
    heldForReview: reviewReasons.length > 0,
    reviewReasons,
  };
}

// ── Conflicts ────────────────────────────────────────────────────────────────

export interface ConflictReport {
  bookingId: string;
  reference: string;
  checkIn: string;
  checkOut: string;
  feedStart: string;
  feedEnd: string;
}

/**
 * Confirmed bookings this feed's events would land on top of — the villa sold
 * twice, which a human has to resolve.
 *
 * A booking recorded FOR one of these events is not a conflict: it is the
 * same stay, written down (villa-booking 00108). It is matched the way every
 * other screen matches it — the UID it was linked by, or the same nights on
 * the same feed after the channel re-keyed the event — so an enriched stay
 * does not raise a double-booking alarm on every sync.
 */
async function findConflicts(
  site: VillaSite,
  feedId: string,
  events: IcalEvent[],
): Promise<ConflictReport[]> {
  if (events.length === 0) return [];

  const { data, error } = await site.client
    .from('bookings')
    .select(
      'id, reference_number, check_in, check_out, source_feed_id, source_external_uid',
    )
    .eq('property_id', site.sitePropertyId)
    .eq('status', 'confirmed');

  if (error) {
    const logger = await getLogger();
    logger.error(
      { propertyId: site.propertyId, error: error.message },
      'ical sync: failed to query bookings for conflict check',
    );
    return [];
  }

  const bookings = data ?? [];

  // A booking fulfils this event when it was linked to it, or when it was
  // linked to a UID this feed no longer carries and holds exactly these
  // nights — which is what a re-key looks like.
  //
  // The second half is deliberately narrow. Accepting any same-dates booking
  // would also swallow the case worth shouting about: the channel cancelled
  // one guest and re-sold the same nights to another, so our stored guest and
  // payout belong to someone who is no longer coming.
  const liveUids = new Set(events.map((e) => e.uid));

  const fulfils = (
    b: {
      source_feed_id: string | null;
      source_external_uid: string | null;
      check_in: string;
      check_out: string;
    },
    e: IcalEvent,
  ) => {
    if (b.source_feed_id !== feedId) return false;
    if (b.source_external_uid === e.uid) return true;

    return (
      !liveUids.has(b.source_external_uid ?? '') &&
      b.check_in === e.start &&
      b.check_out === e.end
    );
  };

  return events.flatMap((e) =>
    bookings
      .filter((b) => e.start < b.check_out && e.end > b.check_in)
      .filter((b) => !fulfils(b, e))
      .map((b) => ({
        bookingId: b.id,
        reference: b.reference_number,
        checkIn: b.check_in,
        checkOut: b.check_out,
        feedStart: e.start,
        feedEnd: e.end,
      })),
  );
}

/**
 * Resolves the recipient email addresses for an urgent double-booking alert:
 *   1. `VILLA_ADMIN_EMAIL` env var if explicitly set; otherwise
 *   2. All `villa_admin` member emails for the property's account in Ooruda;
 *   3. Falls back to `VILLA_EMAIL_FROM` mailbox only if neither yields an address.
 */
async function resolveConflictAlertRecipients(
  accountId: string,
  fromHeader: string,
): Promise<string[]> {
  const explicit = process.env.VILLA_ADMIN_EMAIL?.trim();
  if (explicit) return [explicit];

  try {
    const admin = getSupabaseServerAdminClient();
    const { data: memberships } = await admin
      .from('accounts_memberships')
      .select('user_id')
      .eq('account_id', accountId)
      .eq('account_role', 'villa_admin');

    const userIds = (memberships ?? []).map((m) => m.user_id);
    if (userIds.length > 0) {
      const { data: accounts } = await admin
        .from('accounts')
        .select('email')
        .eq('is_personal_account', true)
        .in('primary_owner_user_id', userIds);

      const emails = [
        ...new Set(
          (accounts ?? [])
            .map((a) => a.email?.trim())
            .filter((e): e is string => Boolean(e)),
        ),
      ];
      if (emails.length > 0) return emails;
    }
  } catch {
    // Fall through to VILLA_EMAIL_FROM address
  }

  const emailMatch = /<([^>]+)>/.exec(fromHeader);
  const fallback = (emailMatch ? emailMatch[1] : fromHeader)?.trim();
  return fallback ? [fallback] : [];
}

async function recordConflicts(
  site: VillaSite,
  feed: { id: string; name: string },
  conflicts: ConflictReport[],
): Promise<void> {
  if (conflicts.length === 0) return;

  const logger = await getLogger();
  const { error } = await site.client.from('ical_conflicts').insert(
    conflicts.map((c) => ({
      feed_id: feed.id,
      booking_id: c.bookingId,
      feed_start: c.feedStart,
      feed_end: c.feedEnd,
      notes: `${feed.name} blocked ${c.feedStart} to ${c.feedEnd}, overlapping confirmed booking ${c.reference}.`,
    })),
  );

  if (error) {
    logger.error(
      { feed: feed.name, error: error.message },
      'ical sync: could not record conflicts in ical_conflicts',
    );
  }

  const from = process.env.VILLA_EMAIL_FROM?.trim();
  if (!from) return;

  const recipients = await resolveConflictAlertRecipients(site.accountId, from);
  if (recipients.length === 0) return;

  const { subject, html } = renderIcalConflictEmail(
    site.name,
    feed.name,
    conflicts,
  );

  for (const to of recipients) {
    try {
      await sendVillaEmail({ to, from, subject, html });
    } catch (err) {
      logger.error(
        {
          feed: feed.name,
          to,
          error: err instanceof Error ? err.message : String(err),
        },
        'ical sync: conflict alert email failed (conflict is recorded in ical_conflicts)',
      );
    }
  }
}

function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatStayRange(checkIn: string, checkOut: string): string {
  const istNoon = (iso: string) => new Date(`${iso}T12:00:00Z`);
  const part = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    istNoon(iso).toLocaleDateString('en-GB', {
      ...opts,
      timeZone: 'Asia/Kolkata',
    });

  const sameMonth =
    part(checkIn, { month: 'short', year: 'numeric' }) ===
    part(checkOut, { month: 'short', year: 'numeric' });

  const from = sameMonth
    ? part(checkIn, { weekday: 'short', day: 'numeric' })
    : `${part(checkIn, { weekday: 'short', day: 'numeric' })} ${part(checkIn, { month: 'short' })}`;

  return `${from} to ${part(checkOut, { weekday: 'short', day: 'numeric' })} ${part(checkOut, { month: 'short', year: 'numeric' })}`;
}

export function renderIcalConflictEmail(
  propertyName: string,
  channel: string,
  conflicts: ConflictReport[],
): { subject: string; html: string } {
  const count = conflicts.length;
  const subject =
    count === 1
      ? `Double booking: ${channel} and ${conflicts[0]!.reference}`
      : `Double booking: ${count} clashes between ${channel} and ${propertyName}`;

  const rows = conflicts
    .map((c) => {
      const nights = nightsBetween(c.feedStart, c.feedEnd);
      return `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e5e5;">
          <div style="font-weight:600;font-size:16px;">${escapeHtml(formatStayRange(c.feedStart, c.feedEnd))}</div>
          <div style="color:#666;font-size:14px;margin-top:2px;">
            ${escapeHtml(nights)} night${nights === 1 ? '' : 's'} blocked on ${escapeHtml(channel)}
          </div>
          <div style="margin-top:8px;font-size:14px;">
            Clashes with <strong>${escapeHtml(c.reference)}</strong> at ${escapeHtml(propertyName)},
            ${escapeHtml(formatStayRange(c.checkIn, c.checkOut))}
          </div>
        </td>
      </tr>`;
    })
    .join('');

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f6f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden;">
    <div style="background:#8a1c1c;color:#ffffff;padding:16px 20px;font-size:18px;font-weight:600;">
      The villa is booked twice
    </div>
    <div style="padding:16px 20px 4px;font-size:15px;line-height:1.5;">
      ${escapeHtml(channel)} has blocked ${count === 1 ? 'a stay' : 'stays'} that ${escapeHtml(propertyName)} has already
      confirmed and taken payment for. Both guests currently believe they have the villa.
    </div>
    <table style="width:100%;border-collapse:collapse;margin-top:12px;">${rows}</table>
    <div style="padding:16px 20px;font-size:14px;line-height:1.5;color:#444;border-top:1px solid #e5e5e5;">
      The ${escapeHtml(channel)} block has been applied to our calendar, so no third guest can book these
      nights. Nothing else has been changed, and no guest has been contacted.
      <br><br>
      Someone needs to decide which booking moves.
    </div>
  </div>
</body></html>`;

  return { subject, html };
}

// ── Status & Sync ────────────────────────────────────────────────────────────

export type FeedSyncStatus =
  | 'ok'
  | 'unchanged'
  | 'fetch_failed'
  | 'parse_failed'
  | 'apply_failed'
  | 'held_for_review'
  | 'no_feeds';

/**
 * Client-safe result returned to the browser. Never includes raw error strings
 * or feed URLs.
 */
export interface FeedSyncResult {
  feedName: string;
  status: FeedSyncStatus;
  applied: number;
  removed: number;
  conflictsCount: number;
}

export interface SyncNowResult {
  feeds: FeedSyncResult[];
  syncedAt: string;
}

export interface IcalFeedStatusSummary {
  lastSyncedAt: string | null;
  lastStatus: string | null;
}

/**
 * Reads the current sync state of active iCal feeds for a property so the UI
 * can show "Synced ..." or "Last sync failed" beside the Sync Airbnb button.
 *
 * Note: `record_ical_failure` updates `last_synced_at = NOW()` even on a failed
 * run, so `last_synced_at` is only a "last ok" timestamp when `last_status === 'ok'`.
 * When any active feed has a non-ok status, `lastSyncedAt` is returned as `null`
 * so the UI never labels a failure timestamp as "last ok".
 */
const ICAL_STATUS_TTL_MS = 60_000;

const icalStatusCache = new Map<
  string,
  { value: IcalFeedStatusSummary; expiresAt: number }
>();

export function invalidateIcalFeedsStatus(sitePropertyId: string) {
  icalStatusCache.delete(sitePropertyId);
}

export async function getIcalFeedsStatus(
  site: VillaSite,
): Promise<IcalFeedStatusSummary> {
  const cached = icalStatusCache.get(site.sitePropertyId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const { data, error } = await site.client
    .from('ical_feeds')
    .select('id, name, last_synced_at, last_status')
    .eq('property_id', site.sitePropertyId)
    .eq('is_active', true)
    .order('name');

  if (error || !data || data.length === 0) {
    const res = { lastSyncedAt: null, lastStatus: null };
    icalStatusCache.set(site.sitePropertyId, {
      value: res,
      expiresAt: Date.now() + ICAL_STATUS_TTL_MS,
    });
    return res;
  }

  let latestOkAt: string | null = null;
  let failedStatus: string | null = null;

  for (const row of data) {
    if (row.last_status && row.last_status !== 'ok') {
      failedStatus = row.last_status;
    } else if (
      row.last_status === 'ok' &&
      row.last_synced_at &&
      (!latestOkAt || row.last_synced_at > latestOkAt)
    ) {
      latestOkAt = row.last_synced_at;
    }
  }

  const res: IcalFeedStatusSummary = failedStatus
    ? { lastSyncedAt: null, lastStatus: failedStatus }
    : {
        lastSyncedAt: latestOkAt,
        lastStatus: latestOkAt ? 'ok' : null,
      };

  icalStatusCache.set(site.sitePropertyId, {
    value: res,
    expiresAt: Date.now() + ICAL_STATUS_TTL_MS,
  });

  return res;
}

/**
 * Re-points this feed's enriched bookings at the UIDs it has just applied.
 *
 * Best-effort: a failed repair leaves the booking visibly unlinked (the
 * screens say "gone from channel"), which is recoverable, and must never fail
 * a sync that has already applied correctly.
 */
async function repairChannelLinks(
  site: VillaSite,
  feedId: string,
  events: IcalEvent[],
): Promise<number> {
  try {
    const linked = (await listChannelLinkedBookings(site)).filter(
      (b) => b.sourceFeedId === feedId,
    );

    if (linked.length === 0) return 0;

    const { relinks } = linkChannelStays({
      // An event with no UID gives nothing to re-link to, and they would all
      // share the empty id and shadow one another in the matcher.
      blocks: events
        .filter((e) => e.uid.trim() !== '')
        .map((e) => ({
          id: e.uid,
          feedId,
          externalUid: e.uid,
          startDate: e.start,
          endDate: e.end,
        })),
      bookings: linked,
      today: todayIst(),
    });

    let repaired = 0;

    for (const relink of relinks) {
      // Each repair stands alone. One that cannot be written — the operator
      // filled the re-keyed event in by hand, so the new UID is already
      // claimed — must not abandon the repairs queued behind it; that
      // booking simply stays unlinked and shows as gone from the channel.
      try {
        if (await relinkChannelBooking(site, relink.bookingId, relink)) {
          repaired += 1;
        }
      } catch (error) {
        (await getLogger()).warn(
          { feedId, bookingId: relink.bookingId, error: String(error) },
          'ical sync: one channel link repair failed',
        );
      }
    }

    if (repaired > 0) {
      (await getLogger()).info(
        { propertyId: site.propertyId, feedId, repaired },
        'ical sync: re-keyed channel links repaired',
      );
    }

    return repaired;
  } catch (error) {
    (await getLogger()).warn(
      { propertyId: site.propertyId, feedId, error: String(error) },
      'ical sync: channel link repair failed',
    );
    return 0;
  }
}

/**
 * Syncs all active iCal feeds for a villa property.
 *
 * Logs every run to:
 *   1. `ical_feeds` on the booking site DB (`apply_ical_feed` / `record_ical_failure`)
 *   2. `villa_sync_log` on Ooruda's DB (`operation: 'ical.sync'`)
 *   3. Server structured logs (`logger.info` / `logger.error`) with URL-redacted details
 */
export async function syncIcalFeeds(
  site: VillaSite,
  actorUserId: string | null = null,
): Promise<SyncNowResult> {
  invalidateIcalFeedsStatus(site.sitePropertyId);
  const logger = await getLogger();
  const startedAt = Date.now();

  const { data: feedRows, error: feedsError } = await site.client
    .from('ical_feeds')
    .select('id, property_id, name, url, last_fingerprint')
    .eq('property_id', site.sitePropertyId)
    .eq('is_active', true)
    .order('name');

  if (feedsError) {
    logger.error(
      { propertyId: site.propertyId, error: feedsError.message },
      'ical sync: failed to load ical_feeds',
    );
    await logSync(site, {
      operation: 'ical.sync',
      outcome: 'error',
      error: `load_feeds_failed: ${feedsError.message}`,
      actorUserId,
    });
    throw new Error('Could not sync channel calendar right now.');
  }

  const feeds = feedRows ?? [];

  if (feeds.length === 0) {
    await logSync(site, {
      operation: 'ical.sync',
      outcome: 'success',
      error: 'no_feeds',
      actorUserId,
    });
    return {
      feeds: [
        {
          feedName: '',
          status: 'no_feeds',
          applied: 0,
          removed: 0,
          conflictsCount: 0,
        },
      ],
      syncedAt: new Date().toISOString(),
    };
  }

  const today = todayIst();
  const results: FeedSyncResult[] = [];
  let anyChanged = false;

  for (const feed of feeds) {
    const feedStart = Date.now();
    const redactedUrl = redactFeedUrl(feed.url);
    const base: FeedSyncResult = {
      feedName: feed.name,
      status: 'ok',
      applied: 0,
      removed: 0,
      conflictsCount: 0,
    };

    // ── 1. Fetch ──────────────────────────────────────────────────────────
    let body: string;
    try {
      ({ body } = await fetchIcal(feed.url));
    } catch (err) {
      const msg =
        err instanceof IcalFetchError ? err.message : 'Unknown fetch error.';
      const durationMs = Date.now() - feedStart;
      logger.error(
        { feed: feed.name, url: redactedUrl, error: msg, ms: durationMs },
        'ical sync: fetch failed',
      );
      await site.client.rpc('record_ical_failure', {
        p_feed_id: feed.id,
        p_status: 'fetch_failed',
        p_error: msg,
      });
      await logSync(site, {
        operation: 'ical.sync',
        siteId: feed.name,
        outcome: 'error',
        error: `fetch_failed (${redactedUrl}, ${durationMs}ms): ${msg}`,
        actorUserId,
      });
      results.push({ ...base, status: 'fetch_failed' });
      continue;
    }

    // ── 2. Parse ──────────────────────────────────────────────────────────
    let events: IcalEvent[];
    let skipped = 0;
    try {
      ({ events, skipped } = parseIcal(body));
    } catch (err) {
      const msg =
        err instanceof IcalParseError ? err.message : 'Unknown parse error.';
      const durationMs = Date.now() - feedStart;
      logger.error(
        { feed: feed.name, url: redactedUrl, error: msg, ms: durationMs },
        'ical sync: parse failed',
      );
      await site.client.rpc('record_ical_failure', {
        p_feed_id: feed.id,
        p_status: 'parse_failed',
        p_error: msg,
      });
      await logSync(site, {
        operation: 'ical.sync',
        siteId: feed.name,
        outcome: 'error',
        error: `parse_failed (${redactedUrl}, ${durationMs}ms): ${msg}`,
        actorUserId,
      });
      results.push({ ...base, status: 'parse_failed' });
      continue;
    }

    const fingerprint = eventSetFingerprint(events);

    // ── 3. Classify ───────────────────────────────────────────────────────
    const classified = classifyEvents(events, { today });
    const droppedSummary = classified.dropped.map((d) => ({
      start: d.event.start,
      end: d.event.end,
      nights: d.nights,
      reason: d.reason,
    }));

    if (classified.heldForReview) {
      const msg = classified.reviewReasons.join(' ');
      const durationMs = Date.now() - feedStart;
      logger.warn(
        {
          feed: feed.name,
          url: redactedUrl,
          skipped,
          reviewReasons: classified.reviewReasons,
          dropped: droppedSummary,
          ms: durationMs,
        },
        'ical sync: held for review',
      );
      await site.client.rpc('record_ical_failure', {
        p_feed_id: feed.id,
        p_status: 'held_for_review',
        p_error: msg,
      });
      await logSync(site, {
        operation: 'ical.sync',
        siteId: feed.name,
        outcome: 'rejected',
        error: `held_for_review (${durationMs}ms): ${msg}`,
        actorUserId,
      });
      results.push({ ...base, status: 'held_for_review' });
      continue;
    }

    // ── 4. Fingerprint check (unchanged) ──────────────────────────────────
    if (feed.last_fingerprint && feed.last_fingerprint === fingerprint) {
      const durationMs = Date.now() - feedStart;
      // Generated types type `p_error` as `string`, though the SQL function
      // accepts `NULL` to clear `last_error` (matching villa-booking's `touch()`).
      await site.client.rpc('record_ical_failure', {
        p_feed_id: feed.id,
        p_status: 'ok',
        p_error: null as unknown as string,
      });
      const summaryJson = JSON.stringify({
        status: 'unchanged',
        applied: 0,
        removed: 0,
        skipped,
        nights: classified.totalNights,
        dropped: droppedSummary.length,
        ms: durationMs,
      });
      logger.info(
        {
          feed: feed.name,
          status: 'unchanged',
          skipped,
          nights: classified.totalNights,
          dropped: droppedSummary,
          ms: durationMs,
        },
        'ical sync: unchanged',
      );
      await logSync(site, {
        operation: 'ical.sync',
        siteId: feed.name,
        outcome: 'success',
        error: summaryJson,
        actorUserId,
      });
      results.push({ ...base, status: 'unchanged' });
      continue;
    }

    // ── 5. Conflicts (detected before writing) ────────────────────────────
    const conflicts = await findConflicts(site, feed.id, classified.apply);

    // ── 6. Apply atomically ───────────────────────────────────────────────
    // The note is the only column the site gives us for channel detail, so
    // everything the feed revealed about the stay goes in it.
    const payload = classified.apply.map((e) => ({
      start: e.start,
      end: e.end,
      uid: e.uid,
      summary: channelBlockNote(feed.name, channelEventDetails(e)),
    }));

    const { data, error: applyError } = await site.client.rpc(
      'apply_ical_feed',
      {
        p_feed_id: feed.id,
        p_events: payload,
        p_fingerprint: fingerprint,
      },
    );

    if (applyError) {
      const msg = `apply failed: ${applyError.message}`;
      const durationMs = Date.now() - feedStart;
      logger.error(
        {
          feed: feed.name,
          url: redactedUrl,
          error: applyError.message,
          ms: durationMs,
        },
        'ical sync: apply failed',
      );
      await site.client.rpc('record_ical_failure', {
        p_feed_id: feed.id,
        p_status: 'fetch_failed',
        p_error: msg,
      });
      await logSync(site, {
        operation: 'ical.sync',
        siteId: feed.name,
        outcome: 'error',
        error: `apply_failed (${durationMs}ms): ${applyError.message}`,
        actorUserId,
      });
      results.push({ ...base, status: 'apply_failed' });
      continue;
    }

    const row = (Array.isArray(data) ? data[0] : data) as {
      removed: number;
      inserted: number;
    } | null;
    const applied = row?.inserted ?? 0;
    const removed = row?.removed ?? 0;
    anyChanged = true;

    // ── 6b. Repair re-keyed links ─────────────────────────────────────────
    // Airbnb reissues a UID whenever an event changes, so a stay an operator
    // already filled in can come back under a new key. The pairing is
    // recovered from the nights and written back, or the booking would show
    // as "gone from channel" beside a fresh, un-enriched channel row.
    await repairChannelLinks(site, feed.id, classified.apply);

    // ── 7. Record conflicts after applying ────────────────────────────────
    if (conflicts.length > 0) {
      await recordConflicts(site, feed, conflicts);
    }

    const durationMs = Date.now() - feedStart;
    const summaryJson = JSON.stringify({
      status: 'ok',
      applied,
      removed,
      skipped,
      nights: classified.totalNights,
      dropped: droppedSummary.length,
      conflicts: conflicts.length,
      ms: durationMs,
    });

    logger.info(
      {
        feed: feed.name,
        status: 'ok',
        applied,
        removed,
        skipped,
        nights: classified.totalNights,
        dropped: droppedSummary,
        conflicts,
        ms: durationMs,
        totalMs: Date.now() - startedAt,
      },
      'ical sync: ok',
    );

    await logSync(site, {
      operation: 'ical.sync',
      siteId: feed.name,
      outcome: 'success',
      error: summaryJson,
      actorUserId,
    });

    results.push({
      ...base,
      status: 'ok',
      applied,
      removed,
      conflictsCount: conflicts.length,
    });
  }

  // Purge the guest booking site cache when blocks changed so the guest
  // availability calendar reflects the sync immediately, and drop Ooruda's
  // own blocks cache so the operator calendar does the same (the sync
  // rewrote `blocked_dates`, which `listBlocks` caches).
  if (anyChanged) {
    invalidateBlocksCache(site.sitePropertyId);
    await revalidateBookingSite('ical-sync');
  }

  return {
    feeds: results,
    syncedAt: new Date().toISOString(),
  };
}
