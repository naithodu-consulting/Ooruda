import 'server-only';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import { todayIst } from '~/lib/villa-db/dates';

import { GUEST_DOCS_BUCKET, recordIdAccess } from './guest-id-access';

const BATCH = 100;

/**
 * Deletes guest ID files whose retention date has come (check-out + the
 * villa's retention days; 30 by default, as the privacy policy states). The
 * row stays as a tombstone (type, masked number, who, when) and the purge is
 * recorded. Idempotent and safe to run from several places: a file already
 * gone is simply tombstoned.
 *
 * `accountId` limits it to one villa (dashboard visits); without it, every
 * villa (the scheduled run).
 */
export async function purgeExpiredGuestIds(
  accountId?: string,
): Promise<{ purged: number; failed: number }> {
  const admin = getSupabaseServerAdminClient();
  const logger = await getLogger();
  let purged = 0;
  let failed = 0;

  for (let round = 0; round < 20; round++) {
    let query = admin
      .from('villa_guest_documents')
      .select('id, account_id, storage_path')
      .is('purged_at', null)
      .not('storage_path', 'is', null)
      .lte('purge_after', todayIst())
      .order('purge_after')
      .limit(BATCH);

    if (accountId) query = query.eq('account_id', accountId);

    const { data: due, error } = await query;

    if (error) {
      logger.error({ code: error.code }, 'villa id purge: load failed');
      break;
    }

    if (!due || due.length === 0) break;

    const { error: removeError } = await admin.storage
      .from(GUEST_DOCS_BUCKET)
      .remove(due.map((d) => d.storage_path!));

    // A failing batch must not block every later purge: retry file by file
    // and tombstone only those actually removed.
    let removed = due;

    if (removeError) {
      removed = [];

      for (const d of due) {
        const { error: one } = await admin.storage
          .from(GUEST_DOCS_BUCKET)
          .remove([d.storage_path!]);

        if (one) {
          failed++;
          logger.error(
            { documentId: d.id, error: one.message },
            'villa id purge: storage delete failed',
          );
        } else {
          removed.push(d);
        }
      }

      if (removed.length === 0) break;
    }

    const { data: done, error: updateError } = await admin
      .from('villa_guest_documents')
      .update({ storage_path: null, purged_at: new Date().toISOString() })
      .in(
        'id',
        removed.map((d) => d.id),
      )
      .is('purged_at', null)
      .select('id, account_id');

    if (updateError) {
      failed += removed.length;
      logger.error(
        { count: due.length, code: updateError.code },
        'villa id purge: tombstone failed',
      );
      break;
    }

    await recordIdAccess(
      (done ?? []).map((d) => ({
        accountId: d.account_id,
        documentId: d.id,
        action: 'purged' as const,
        actor: null,
      })),
    );

    purged += done?.length ?? 0;

    if (due.length < BATCH) break;
  }

  if (purged || failed) {
    logger.info({ purged, failed, accountId }, 'villa id purge');
  }

  return { purged, failed };
}
