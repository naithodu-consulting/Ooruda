import 'server-only';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import type { Json } from '~/lib/database.types';

export type AuditEventType =
  | 'user_action'
  | 'api_call'
  | 'auth_event'
  | 'system_event'
  | 'error';

export interface AuditEventParams {
  /** Association context. Nullable for platform-level events (auth, system). */
  associationId?: string | null;
  /** Authenticated user. Null for cron/system events. */
  actorUserId?: string | null;
  /** Logical action key e.g. "payment.recorded", "auth.login" */
  action: string;
  /** Domain entity being acted on e.g. "bill", "payment", "user" */
  entityType: string;
  /** Primary key of the affected entity row */
  entityId?: string | null;
  /** Human-readable one-liner for the activity log */
  summary?: string | null;
  /** Classification - defaults to 'user_action' */
  eventType?: AuditEventType;
  /** HTTP method for api_call events */
  httpMethod?: string | null;
  /** Request path e.g. "/api/billing/generate" */
  path?: string | null;
  /** HTTP or application status code */
  statusCode?: number | null;
  /** Request duration in milliseconds */
  durationMs?: number | null;
  /** Application-level error key e.g. "INSUFFICIENT_BALANCE" */
  errorCode?: string | null;
  /** Flexible JSON for extra context - keep small (no PII, no large payloads) */
  metadata?: Record<string, unknown> | null;
  /** Client IP (from x-forwarded-for) */
  ipAddress?: string | null;
  /** User-agent header value */
  userAgent?: string | null;
  /** When true, use the admin client (bypasses RLS). Use for system/auth events. */
  useAdminClient?: boolean;
}

/**
 * Best-effort audit/activity trail entry. Never throws - a logging failure must
 * not block the mutation it describes, which has already happened by call time.
 *
 * All params are optional except `action` and `entityType`.
 */
export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  try {
    // System and auth events have no user context - must use admin client.
    // User-action events use the server client so RLS can verify the actor.
    const useAdmin =
      params.useAdminClient ??
      (params.eventType === 'system_event' ||
        params.eventType === 'auth_event');
    const client = useAdmin
      ? getSupabaseServerAdminClient()
      : getSupabaseServerClient();

    let actorUserId = params.actorUserId ?? null;

    // Auto-resolve actor from session when not explicitly supplied.
    if (!actorUserId && !useAdmin) {
      const {
        data: { user },
      } = await client.auth.getUser();
      actorUserId = user?.id ?? null;
    }

    if (!actorUserId && !useAdmin) return; // no session, no system context - skip

    await client.from('audit_logs').insert({
      association_id: params.associationId ?? null,
      actor_user_id: actorUserId,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      summary: params.summary ?? null,
      event_type: params.eventType ?? 'user_action',
      http_method: params.httpMethod ?? null,
      path: params.path ?? null,
      status_code: params.statusCode ?? null,
      duration_ms: params.durationMs ?? null,
      error_code: params.errorCode ?? null,
      metadata: (params.metadata ?? null) as Json | null,
      ip_address: params.ipAddress ?? null,
      user_agent: params.userAgent ?? null,
    });
  } catch {
    // intentionally silent - audit failure must never surface to the user
  }
}
