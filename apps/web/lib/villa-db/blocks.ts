import 'server-only';
import { assertAvailable } from './availability';
import type { VillaSite } from './client';
import { nightsIn } from './dates';
import { VillaDbError, fromSiteError, fromSiteWriteError } from './errors';
import { withSyncLog } from './sync-log';

import { randomUUID } from 'node:crypto';

/**
 * Blocked dates on the villa-booking database (integration contract §4).
 *
 * A block makes nights unbookable on the guest site and — through it — on
 * any channel manager reading the site's availability. Phone/WhatsApp
 * bookings are NOT blocks: record those as bookings so they count in revenue.
 */

export const BLOCK_REASONS = [
  'maintenance',
  'owner_hold',
  'direct_enquiry',
  'offline_booking',
] as const;

export type BlockReason = (typeof BLOCK_REASONS)[number];

export interface Block {
  id: string;
  startDate: string;
  /** Exclusive: the morning after the last blocked night. */
  endDate: string;
  reason: string | null;
  notes: string | null;
  /**
   * 'manual' = entered by a person in Ooruda. 'ical' = imported from a booking
   * channel's calendar feed, and owned by that importer: every sync deletes
   * the feed's rows and re-inserts the channel's current events
   * (`apply_ical_feed`, villa-booking 00104). Releasing such a block here
   * looks like it worked and is undone by the next sync, so the service
   * refuses it and the UI shows it as managed elsewhere.
   */
  source: BlockSource;
  /** The channel feed that owns this block, when `source` is 'ical'. */
  feedId: string | null;
  /**
   * The channel's UID for the event this row came from. Tracing only as far
   * as the site is concerned (channels reissue UIDs), but it is half of the
   * key an enriched booking is linked by — see lib/villa/channel-link.
   */
  externalUid: string | null;
  /**
   * The channel's own name ('Airbnb'), read from `ical_feeds`, when `source`
   * is 'ical'. The site stamps every imported row with reason
   * `offline_booking`, so the reason alone would call an Airbnb stay an
   * offline booking: the name is what the operator must see.
   */
  channelName: string | null;
}

export type BlockSource = 'manual' | 'ical';

// Stamped into notes (operator-only, never shown to guests) so a block
// created by Ooruda can be traced back from the site.
function marker(): string {
  return `[ooruda:${randomUUID()}]`;
}

const BLOCK_COLUMNS =
  'id, start_date, end_date, reason, notes, source, feed_id, external_uid';

function toBlock(
  row: {
    id: string;
    start_date: string;
    end_date: string;
    reason: string | null;
    notes: string | null;
    source: string;
    feed_id: string | null;
    external_uid: string | null;
  },
  channelNames?: Map<string, string>,
): Block {
  const source = row.source === 'ical' ? 'ical' : 'manual';

  return {
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    reason: row.reason,
    notes: row.notes,
    source,
    feedId: row.feed_id,
    externalUid: row.external_uid,
    channelName:
      source === 'ical' && row.feed_id
        ? (channelNames?.get(row.feed_id) ?? null)
        : null,
  };
}

const FEED_NAMES_TTL_MS = 5 * 60_000;

const feedNamesCache = new Map<
  string,
  { value: Map<string, string>; expiresAt: number }
>();

export function invalidateFeedNamesCache(sitePropertyId?: string) {
  if (sitePropertyId) {
    feedNamesCache.delete(sitePropertyId);
  } else {
    feedNamesCache.clear();
  }
}

/**
 * feed id → channel name for the property's iCal feeds. Feeds change about
 * never, so this is cached well past the blocks themselves; a failed read
 * returns an empty map and the UI falls back to a generic channel label
 * rather than failing the page.
 */
async function listFeedNames(site: VillaSite): Promise<Map<string, string>> {
  const cached = feedNamesCache.get(site.sitePropertyId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const { data, error } = await site.client
    .from('ical_feeds')
    .select('id, name')
    .eq('property_id', site.sitePropertyId);

  const value = new Map<string, string>();

  if (!error) {
    for (const row of data ?? []) {
      if (row.name?.trim()) value.set(row.id, row.name.trim());
    }
  }

  feedNamesCache.set(site.sitePropertyId, {
    value,
    expiresAt: Date.now() + FEED_NAMES_TTL_MS,
  });

  return value;
}

/** Channel-owned blocks are read-only here: the importer replaces them. */
function assertReleasable(block: Block): void {
  if (block.source === 'ical') {
    throw new VillaDbError(
      'CHANNEL_MANAGED',
      `block ${block.id} is owned by feed ${block.feedId}`,
    );
  }
}

const BLOCKS_CACHE_TTL_MS = 30_000;

const blocksCache = new Map<string, { value: Block[]; expiresAt: number }>();

export function invalidateBlocksCache(sitePropertyId?: string) {
  if (sitePropertyId) {
    for (const key of blocksCache.keys()) {
      if (key.startsWith(sitePropertyId)) {
        blocksCache.delete(key);
      }
    }
  } else {
    blocksCache.clear();
  }
}

/** Blocks overlapping [from, to). */
export async function listBlocks(
  site: VillaSite,
  from: string,
  to: string,
): Promise<Block[]> {
  nightsIn(from, to);

  const cacheKey = `${site.sitePropertyId}:${from}:${to}`;
  const cached = blocksCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const { data, error } = await site.client
    .from('blocked_dates')
    .select(BLOCK_COLUMNS)
    .eq('property_id', site.sitePropertyId)
    .lt('start_date', to)
    .gt('end_date', from)
    .order('start_date');

  if (error) throw fromSiteError(error);

  const rows = data ?? [];
  const channelNames = rows.some((r) => r.source === 'ical')
    ? await listFeedNames(site)
    : undefined;

  const result = rows.map((r) => toBlock(r, channelNames));

  blocksCache.set(cacheKey, {
    value: result,
    expiresAt: Date.now() + BLOCKS_CACHE_TTL_MS,
  });

  return result;
}

/**
 * Blocks [from, to). Checks availability first: the database would otherwise
 * accept a block laid over a confirmed guest (contract §4).
 */
export async function createBlock(
  site: VillaSite,
  input: {
    from: string;
    to: string;
    reason: BlockReason;
    notes?: string | null;
  },
  actorUserId: string | null,
): Promise<Block> {
  nightsIn(input.from, input.to);

  if (!BLOCK_REASONS.includes(input.reason)) {
    throw new VillaDbError('INVALID_INPUT', `bad reason ${input.reason}`);
  }

  return withSyncLog(site, 'block.create', actorUserId, async () => {
    await assertAvailable(site, input.from, input.to);

    const notes = [input.notes?.trim(), marker()].filter(Boolean).join(' ');

    const { data, error } = await site.client
      .from('blocked_dates')
      .insert({
        property_id: site.sitePropertyId,
        start_date: input.from,
        end_date: input.to,
        reason: input.reason,
        notes,
        source: 'manual',
      })
      .select(BLOCK_COLUMNS)
      .single();

    if (error) throw fromSiteWriteError(error);

    invalidateBlocksCache(site.sitePropertyId);
    return { result: toBlock(data), siteId: data.id };
  });
}

/**
 * Unblocks [from, to) out of an existing block, keeping any nights of the
 * block outside that range blocked. Unblocking 11 Oct from [10, 13) leaves
 * [10, 11) and [12, 13).
 *
 * The site API has no multi-statement transaction (a site-side RPC is owed:
 * villa-booking TODO, "release_blocked_nights"). Until then the order fails
 * safe: the remaining pieces are inserted BEFORE the original is deleted, so a
 * failure in between leaves an extra overlapping block (nights stay
 * unbookable) rather than nights silently opened for sale.
 *
 * Concurrency: the original is deleted only if it still exists. If another
 * release got there first, this one removes the pieces it just inserted and
 * reports CONFLICT, so two partial releases can never undo each other.
 */
export async function releaseFromBlock(
  site: VillaSite,
  blockId: string,
  range: { from: string; to: string },
  actorUserId: string | null,
): Promise<{ remaining: Block[] }> {
  nightsIn(range.from, range.to);

  return withSyncLog(site, 'block.release', actorUserId, async () => {
    const { data: row, error } = await site.client
      .from('blocked_dates')
      .select(BLOCK_COLUMNS)
      .eq('id', blockId)
      .eq('property_id', site.sitePropertyId)
      .maybeSingle();

    if (error) throw fromSiteError(error);
    if (!row) throw new VillaDbError('NOT_FOUND', `block ${blockId}`);

    const block = toBlock(row);

    assertReleasable(block);

    const from = range.from < block.startDate ? block.startDate : range.from;
    const to = range.to > block.endDate ? block.endDate : range.to;

    if (from >= to) {
      throw new VillaDbError(
        'INVALID_INPUT',
        `range ${range.from} → ${range.to} is outside block ${blockId}`,
        'Those nights are not part of this block.',
      );
    }

    const pieces = [
      { start: block.startDate, end: from },
      { start: to, end: block.endDate },
    ].filter((p) => p.start < p.end);

    let remaining: Block[] = [];

    if (pieces.length > 0) {
      const { data: inserted, error: insertError } = await site.client
        .from('blocked_dates')
        .insert(
          // source and feed_id are carried over, not defaulted: an imported
          // block whose leftover pieces came back as 'manual' would be
          // orphaned from its feed and duplicated by the next sync. Only
          // manual blocks reach here today (assertReleasable), so this is the
          // invariant, not a live path.
          pieces.map((p) => ({
            property_id: site.sitePropertyId,
            start_date: p.start,
            end_date: p.end,
            reason: block.reason,
            notes: block.notes,
            source: block.source,
            feed_id: block.feedId,
            external_uid: block.externalUid,
          })),
        )
        .select(BLOCK_COLUMNS);

      if (insertError) throw fromSiteWriteError(insertError);
      remaining = (inserted ?? []).map((r) => toBlock(r));
    }

    const { data: deleted, error: deleteError } = await site.client
      .from('blocked_dates')
      .delete()
      .eq('id', blockId)
      .eq('property_id', site.sitePropertyId)
      .select('id');

    if (deleteError) throw fromSiteWriteError(deleteError);

    if (!deleted || deleted.length === 0) {
      // Someone else already released or replaced this block: undo our pieces.
      if (remaining.length > 0) {
        await site.client
          .from('blocked_dates')
          .delete()
          .in(
            'id',
            remaining.map((b) => b.id),
          )
          .eq('property_id', site.sitePropertyId);
      }

      throw new VillaDbError(
        'CONFLICT',
        `block ${blockId} changed during release`,
        'This block was changed by someone else. Refresh the calendar and try again.',
      );
    }

    invalidateBlocksCache(site.sitePropertyId);
    return { result: { remaining }, siteId: blockId };
  });
}

/** Whole-block removal: releases every night of the block. */
export async function deleteBlock(
  site: VillaSite,
  blockId: string,
  actorUserId: string | null,
): Promise<void> {
  const { data: block, error } = await site.client
    .from('blocked_dates')
    .select('start_date, end_date, source, feed_id')
    .eq('id', blockId)
    .eq('property_id', site.sitePropertyId)
    .maybeSingle();

  if (error) throw fromSiteError(error);
  if (!block) throw new VillaDbError('NOT_FOUND', `block ${blockId}`);

  if (block.source === 'ical') {
    throw new VillaDbError(
      'CHANNEL_MANAGED',
      `block ${blockId} is owned by feed ${block.feed_id}`,
    );
  }

  await releaseFromBlock(
    site,
    blockId,
    { from: block.start_date, to: block.end_date },
    actorUserId,
  );
}

/**
 * The channel block for one feed event, or null.
 *
 * Keyed on (feed_id, external_uid) rather than the row id on purpose:
 * `apply_ical_feed` deletes and re-inserts the feed's rows on every sync, so
 * every `blocked_dates.id` is new afterwards. A screen rendered before a sync
 * carries ids that no longer exist, and looking one up would report a stay
 * that is sitting right there in the calendar as gone.
 */
export async function getChannelBlock(
  site: VillaSite,
  link: { feedId: string; externalUid: string },
): Promise<Block | null> {
  const { data, error } = await site.client
    .from('blocked_dates')
    .select(BLOCK_COLUMNS)
    .eq('property_id', site.sitePropertyId)
    .eq('feed_id', link.feedId)
    .eq('external_uid', link.externalUid)
    .order('start_date')
    .limit(2);

  if (error) throw fromSiteError(error);

  const rows = data ?? [];

  // One event, one row. Two would mean the feed's own rows disagree, and
  // guessing which the operator meant is worse than refusing.
  if (rows.length !== 1) return null;

  return toBlock(rows[0]!, await listFeedNames(site));
}
