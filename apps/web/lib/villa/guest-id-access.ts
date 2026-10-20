import 'server-only';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

export const GUEST_DOCS_BUCKET = 'villa-guest-docs';

export type IdDocAction =
  | 'uploaded'
  | 'recorded'
  | 'viewed'
  | 'verified'
  | 'deleted'
  | 'purged';

/**
 * Every touch of an ID document is recorded. Returns false (and logs) if the
 * record could not be written; views fail closed on that.
 */
export async function recordIdAccess(
  entries: {
    accountId: string;
    documentId: string;
    action: IdDocAction;
    actor: string | null;
  }[],
): Promise<boolean> {
  if (entries.length === 0) return true;

  const { error } = await getSupabaseServerAdminClient()
    .from('villa_guest_document_access')
    .insert(
      entries.map((e) => ({
        account_id: e.accountId,
        document_id: e.documentId,
        action: e.action,
        actor_user_id: e.actor,
      })),
    );

  if (error) {
    (await getLogger()).error(
      { code: error.code, count: entries.length },
      'villa guest document access record failed',
    );
    return false;
  }

  return true;
}
