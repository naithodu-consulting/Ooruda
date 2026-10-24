import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import type { Database } from '~/lib/database.types';
import { todayIst } from '~/lib/villa-db/dates';

type Admin = SupabaseClient<Database>;

import { GUEST_DOCS_BUCKET, recordIdAccess } from './guest-id-access';

const BATCH = 100;

/**
 * Deletes guest ID files whose retention date has come (check-out + the
 * villa's retention days; 30 by default, as the privacy policy states). The
 * document row stays as a tombstone (type, masked number, who, when) and the
 * purge is recorded. Idempotent and safe to run from several places: a file
 * already gone is simply tombstoned.
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
      .from('villa_guest_document_files')
      .select('id, account_id, document_id, storage_path')
      .is('purged_at', null)
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
      .remove(due.map((f) => f.storage_path));

    // A failing batch must not block every later purge: retry file by file
    // and tombstone only those actually removed.
    let removed = due;

    if (removeError) {
      removed = [];

      for (const f of due) {
        const { error: one } = await admin.storage
          .from(GUEST_DOCS_BUCKET)
          .remove([f.storage_path]);

        if (one) {
          failed++;
          logger.error(
            { fileId: f.id, error: one.message },
            'villa id purge: storage delete failed',
          );
        } else {
          removed.push(f);
        }
      }

      if (removed.length === 0) break;
    }

    const now = new Date().toISOString();

    const { data: doneFiles, error: updateFilesError } = await admin
      .from('villa_guest_document_files')
      .update({ purged_at: now })
      .in(
        'id',
        removed.map((f) => f.id),
      )
      .is('purged_at', null)
      .select('id, document_id, account_id');

    if (updateFilesError) {
      failed += removed.length;
      logger.error(
        { count: due.length, code: updateFilesError.code },
        'villa id purge: file tombstone failed',
      );
      break;
    }

    // Tombstone parent documents where every file is now purged. One query
    // for the whole batch rather than a count per document.
    const docIds = [...new Set((doneFiles ?? []).map((f) => f.document_id))];

    await tombstoneEmptyDocuments(admin, docIds, now);

    // Record access log entries (keyed to document ID, not file ID).
    await recordIdAccess(
      (doneFiles ?? []).map((f) => ({
        accountId: f.account_id,
        documentId: f.document_id,
        action: 'purged' as const,
        actor: null,
      })),
    );

    purged += doneFiles?.length ?? 0;

    if (due.length < BATCH) break;
  }

  // Self-heal: the file tombstone and the document tombstone are separate
  // writes, so a process that died between them leaves a document with no
  // live files still marked live. Those files never come back through the
  // loop above (they are already purged), so the stranded document would
  // stay that way forever. Sweep for them once per run.
  await sweepStrandedDocuments(admin, accountId, logger);

  if (purged || failed) {
    logger.info({ purged, failed, accountId }, 'villa id purge');
  }

  return { purged, failed };
}

/**
 * Marks each of `docIds` purged when it has no live file left. A document
 * that never had a file (recorded as seen in person) is left alone: there is
 * no photo to have been deleted.
 */
async function tombstoneEmptyDocuments(
  admin: Admin,
  docIds: string[],
  now: string,
) {
  if (docIds.length === 0) return;

  const { data: files, error } = await admin
    .from('villa_guest_document_files')
    .select('document_id, purged_at')
    .in('document_id', docIds);

  if (error) return;

  const hasAnyFile = new Set((files ?? []).map((f) => f.document_id));
  const hasLiveFile = new Set(
    (files ?? []).filter((f) => !f.purged_at).map((f) => f.document_id),
  );

  const empty = docIds.filter(
    (id) => hasAnyFile.has(id) && !hasLiveFile.has(id),
  );

  if (empty.length === 0) return;

  await admin
    .from('villa_guest_documents')
    .update({ purged_at: now })
    .in('id', empty)
    .is('purged_at', null);
}

/** Documents past their retention date whose files are all already purged. */
async function sweepStrandedDocuments(
  admin: Admin,
  accountId: string | undefined,
  logger: Awaited<ReturnType<typeof getLogger>>,
) {
  let query = admin
    .from('villa_guest_documents')
    .select('id')
    .is('purged_at', null)
    .lte('purge_after', todayIst())
    .limit(BATCH);

  if (accountId) query = query.eq('account_id', accountId);

  const { data: dueDocs, error } = await query;

  if (error || !dueDocs?.length) return;

  try {
    await tombstoneEmptyDocuments(
      admin,
      dueDocs.map((d) => d.id),
      new Date().toISOString(),
    );
  } catch (e) {
    logger.warn(
      { accountId, error: String(e) },
      'villa id purge: stranded document sweep failed',
    );
  }
}
