import 'server-only';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

/**
 * Best-effort audit trail entry. Never throws — a logging failure must not
 * block the mutation it's describing, which has already happened by the
 * time this is called.
 */
export async function logAuditEvent(params: {
  associationId: string;
  action: string;
  entityType: string;
  entityId?: string;
  summary: string;
}): Promise<void> {
  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return;
  }

  await client.from('audit_logs').insert({
    association_id: params.associationId,
    actor_user_id: user.id,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
    summary: params.summary,
  });
}
