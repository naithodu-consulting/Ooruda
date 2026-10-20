import 'server-only';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import type { VillaSite } from './client';
import { REJECTION_CODES, isVillaDbError } from './errors';

/**
 * Records one Ooruda operation against the villa-booking database in
 * `villa_sync_log`. Best-effort: a logging failure never fails the operation
 * it describes (the write on the site has already happened or not).
 */
export async function logSync(
  site: Pick<VillaSite, 'accountId' | 'propertyId'>,
  entry: {
    operation: string;
    siteId?: string | null;
    outcome: 'success' | 'error' | 'rejected' | 'uncertain';
    error?: unknown;
    actorUserId?: string | null;
  },
): Promise<void> {
  const errorText =
    entry.error === undefined
      ? null
      : isVillaDbError(entry.error)
        ? `${entry.error.code}: ${entry.error.detail ?? entry.error.message}`
        : String(
            entry.error instanceof Error ? entry.error.message : entry.error,
          );

  try {
    const { error } = await getSupabaseServerAdminClient()
      .from('villa_sync_log')
      .insert({
        account_id: site.accountId,
        property_id: site.propertyId,
        operation: entry.operation,
        site_id: entry.siteId ?? null,
        outcome: entry.outcome,
        error: errorText?.slice(0, 1000) ?? null,
        actor_user_id: entry.actorUserId ?? null,
      });

    if (error) throw error;
  } catch (error) {
    const logger = await getLogger();
    logger.warn(
      { error, operation: entry.operation },
      'villa sync log write failed',
    );
  }
}

/**
 * Runs a write against the site and logs its outcome. Domain rejections
 * (dates taken, overlaps…) are logged as 'rejected', not 'error'.
 */
export async function withSyncLog<T>(
  site: Pick<VillaSite, 'accountId' | 'propertyId'>,
  operation: string,
  actorUserId: string | null,
  run: () => Promise<{ result: T; siteId?: string | null }>,
): Promise<T> {
  try {
    const { result, siteId } = await run();
    await logSync(site, { operation, siteId, outcome: 'success', actorUserId });
    return result;
  } catch (error) {
    const outcome =
      isVillaDbError(error) && error.code === 'UNCERTAIN'
        ? 'uncertain'
        : isVillaDbError(error) && REJECTION_CODES.includes(error.code)
          ? 'rejected'
          : 'error';

    await logSync(site, { operation, outcome, error, actorUserId });
    throw error;
  }
}
