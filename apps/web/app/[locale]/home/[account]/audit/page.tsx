import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { PageBody } from '@kit/ui/page';

import { ROLE_LABELS, type PropOpsRole, requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { AuditLogCard, type AuditLogRow } from './_components/audit-log-card';

interface Props {
  params: Promise<{ account: string }>;
  searchParams: Promise<{ page?: string; search?: string; eventType?: string }>;
}

const PAGE_SIZE = 25;

export const metadata = { title: 'Audit Log' };

export default async function AuditPage({ params, searchParams }: Props) {
  const { account } = await params;
  const { page: pageParam, search, eventType } = await searchParams;
  const { accountId } = await requireRole(account, ['assoc_admin']);

  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const client = getSupabaseServerClient();
  const adminClient = getSupabaseServerAdminClient();

  const { data: association } = await client
    .from('associations')
    .select('id')
    .eq('account_id', accountId)
    .single();

  if (!association) {
    throw new Error('Unable to load the association for this account.');
  }

  // If searching by name, resolve matching user IDs first
  let actorIdFilter: string[] | null = null;
  if (search) {
    const { data: matchingProfiles } = await adminClient
      .from('profiles')
      .select('id')
      .ilike('full_name', `%${search}%`);
    actorIdFilter = (matchingProfiles ?? []).map((p) => p.id);
  }

  let query = client
    .from('audit_logs')
    .select(
      'id, action, entity_type, summary, actor_user_id, created_at, event_type, status_code, error_code, path',
      {
        count: 'exact',
      },
    )
    .eq('association_id', association.id)
    .order('created_at', { ascending: false });

  // Event type filter
  const validEventTypes = [
    'user_action',
    'api_call',
    'auth_event',
    'system_event',
    'error',
  ];
  if (eventType && validEventTypes.includes(eventType)) {
    if (eventType === 'error') {
      // "error" tab: any event with status_code >= 400 OR event_type = 'error'
      query = query.or(`event_type.eq.error,status_code.gte.400`);
    } else {
      query = query.eq('event_type', eventType);
    }
  }

  if (search) {
    if (actorIdFilter && actorIdFilter.length > 0) {
      query = query.or(
        `action.ilike.%${search}%,summary.ilike.%${search}%,actor_user_id.in.(${actorIdFilter.map((id) => `"${id}"`).join(',')})`,
      );
    } else {
      query = query.or(`action.ilike.%${search}%,summary.ilike.%${search}%`);
    }
  }

  const { data: logs, count } = await query.range(from, to);

  const actorIds = [
    ...new Set((logs ?? []).map((l) => l.actor_user_id).filter(Boolean)),
  ] as string[];

  const { data: profiles } =
    actorIds.length > 0
      ? await adminClient
          .from('profiles')
          .select('id, full_name')
          .in('id', actorIds)
      : { data: [] };

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const { data: actorMemberships } =
    actorIds.length > 0
      ? await client
          .from('accounts_memberships')
          .select('user_id, account_role')
          .eq('account_id', accountId)
          .in('user_id', actorIds)
      : { data: [] };

  const roleLabelById = new Map(
    (actorMemberships ?? []).map((m) => [
      m.user_id,
      ROLE_LABELS[m.account_role as PropOpsRole] ?? null,
    ]),
  );

  const rows: AuditLogRow[] = (logs ?? []).map((l) => ({
    id: l.id,
    action: l.action,
    entity_type: l.entity_type,
    summary: l.summary,
    actor: l.actor_user_id
      ? (nameById.get(l.actor_user_id) ?? 'Unknown')
      : 'System',
    actorRoleLabel: l.actor_user_id
      ? (roleLabelById.get(l.actor_user_id) ?? 'Super Admin')
      : null,
    created_at: l.created_at,
    eventType: l.event_type ?? 'user_action',
    statusCode: l.status_code ?? null,
    errorCode: l.error_code ?? null,
    path: l.path ?? null,
  }));

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title="Audit Log"
        description={
          totalCount === 0
            ? 'Nothing logged yet'
            : eventType
              ? `${totalCount} ${eventType.replace('_', ' ')} event${totalCount === 1 ? '' : 's'}`
              : `${totalCount} event${totalCount === 1 ? '' : 's'} · most recent first`
        }
      />

      <AuditLogCard
        rows={rows}
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={PAGE_SIZE}
        search={search ?? ''}
        eventType={eventType ?? ''}
      />
    </PageBody>
  );
}
