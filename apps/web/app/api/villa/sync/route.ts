import { NextResponse } from 'next/server';

import { enhanceRouteHandler } from '@kit/next/routes';
import { getLogger } from '@kit/shared/logger';

import { purgeExpiredGuestIds } from '~/lib/villa/guest-id-retention';
import { syncAllMirrors } from '~/lib/villa/mirror';

import { timingSafeEqual } from 'node:crypto';

// Copying a villa's bookings can take longer than a page request.
export const maxDuration = 300;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;

  // Unset means the scheduled sync is switched off, never open.
  if (!secret || secret.length < 32) return false;

  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);

  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Scheduled villa housekeeping: deletes guest ID files past their retention
 * date, then refreshes every villa's bookings mirror (OORUDA_VILLA_PLAN.md
 * §3.3). Called by the scheduler with `Authorization: Bearer $CRON_SECRET`
 * (the Vercel Cron convention). Dashboards also refresh a stale mirror on
 * their own, so a missed run only delays reports.
 */
export const GET = enhanceRouteHandler(
  async ({ request }) => {
    if (!authorised(request)) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const logger = await getLogger();

    try {
      // Retention first: deleting guest IDs on time matters more than
      // fresh figures.
      const ids = await purgeExpiredGuestIds();
      const { synced, failed } = await syncAllMirrors();

      logger.info(
        { synced: synced.length, failed: failed.length },
        'villa mirror scheduled sync',
      );

      // Property ids and counts only: no guest data in the response.
      return NextResponse.json({
        synced: synced.length,
        failed: failed.map((f) => f.propertyId),
        idsPurged: ids.purged,
        idsPurgeFailed: ids.failed,
      });
    } catch (error) {
      logger.error(
        { error: String(error) },
        'villa mirror scheduled sync failed',
      );
      return NextResponse.json({ error: 'sync failed' }, { status: 500 });
    }
  },
  { auth: false },
);
