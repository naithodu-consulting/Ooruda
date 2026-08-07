import { AdminGuard } from '@kit/admin/components/admin-guard';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { PageBody, PageHeader } from '@kit/ui/page';

import {
  AdminActivityCard,
  type AdminActivityRow,
} from './_components/admin-activity-card';

interface Props {
  searchParams: Promise<{ page?: string; search?: string; eventType?: string }>;
}

const PAGE_SIZE = 50;

async function AdminActivityPage({ searchParams }: Props) {
  const { page: pageParam, search, eventType } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const adminClient = getSupabaseServerAdminClient();

  let query = adminClient
    .from('audit_logs')
    .select(
      'id, action, entity_type, summary, actor_user_id, association_id, created_at, event_type, status_code, error_code, path',
      {
        count: 'exact',
      },
    )
    .order('created_at', { ascending: false });

  const validEventTypes = [
    'user_action',
    'api_call',
    'auth_event',
    'system_event',
    'error',
  ];
  if (eventType && validEventTypes.includes(eventType)) {
    if (eventType === 'error') {
      query = query.or(`event_type.eq.error,status_code.gte.400`);
    } else {
      query = query.eq('event_type', eventType);
    }
  }

  if (search) {
    query = query.or(`action.ilike.%${search}%,summary.ilike.%${search}%`);
  }

  const { data: logs, count } = await query.range(from, to);

  const actorIds = [
    ...new Set((logs ?? []).map((l) => l.actor_user_id).filter(Boolean)),
  ] as string[];

  const assocIds = [
    ...new Set((logs ?? []).map((l) => l.association_id).filter(Boolean)),
  ] as string[];

  const [profilesResult, assocResult] = await Promise.all([
    actorIds.length > 0
      ? adminClient.from('profiles').select('id, full_name').in('id', actorIds)
      : Promise.resolve({ data: [] }),
    assocIds.length > 0
      ? adminClient
          .from('associations')
          .select('id, accounts!inner(name)')
          .in('id', assocIds)
      : Promise.resolve({ data: [] }),
  ]);

  const nameById = new Map(
    (profilesResult.data ?? []).map((p) => [p.id, p.full_name]),
  );
  const assocNameById = new Map(
    (assocResult.data ?? []).map((a) => [
      a.id,
      (a.accounts as { name?: string } | null)?.name ?? null,
    ]),
  );

  const rows: AdminActivityRow[] = (logs ?? []).map((l) => ({
    id: l.id,
    action: l.action,
    summary: l.summary,
    actor: l.actor_user_id
      ? (nameById.get(l.actor_user_id) ?? 'Unknown')
      : 'System',
    association: l.association_id
      ? (assocNameById.get(l.association_id) ?? l.association_id.slice(0, 8))
      : '—',
    created_at: l.created_at,
    eventType: l.event_type ?? 'user_action',
    statusCode: l.status_code ?? null,
    errorCode: l.error_code ?? null,
    path: l.path ?? null,
  }));

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Activity Log"
        description={
          eventType
            ? `${totalCount} ${eventType.replace('_', ' ')} event${totalCount === 1 ? '' : 's'} · platform-wide`
            : `Platform-wide event log · ${totalCount} total event${totalCount === 1 ? '' : 's'}`
        }
      />
      <PageBody>
        <AdminActivityCard
          rows={rows}
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={PAGE_SIZE}
          search={search ?? ''}
          eventType={eventType ?? ''}
        />
      </PageBody>
    </>
  );
}

export default AdminGuard(AdminActivityPage);
