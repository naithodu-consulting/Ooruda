import { AdminGuard } from '@kit/admin/components/admin-guard';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { PageBody, PageHeader } from '@kit/ui/page';

import {
  AdminActivityCard,
  type AdminActivityRow,
  type AssocOption,
} from './_components/admin-activity-card';

interface Props {
  searchParams: Promise<{
    page?: string;
    search?: string;
    eventType?: string;
    dateFrom?: string;
    dateTo?: string;
    assocId?: string;
  }>;
}

const PAGE_SIZE = 50;
const DEFAULT_DAYS = 7;

function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function nDaysAgoIST(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

async function AdminActivityPage({ searchParams }: Props) {
  const {
    page: pageParam,
    search,
    eventType,
    dateFrom,
    dateTo,
    assocId,
  } = await searchParams;

  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Default: last 7 days in IST
  const effectiveDateFrom = dateFrom ?? nDaysAgoIST(DEFAULT_DAYS);
  const effectiveDateTo = dateTo ?? todayIST();
  const isDefaultRange = !dateFrom && !dateTo;

  const adminClient = getSupabaseServerAdminClient();

  let query = adminClient
    .from('audit_logs')
    .select(
      'id, action, entity_type, summary, actor_user_id, association_id, created_at, event_type, status_code, error_code, path',
      { count: 'exact' },
    )
    .gte('created_at', effectiveDateFrom + 'T00:00:00+05:30')
    .lte('created_at', effectiveDateTo + 'T23:59:59+05:30')
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

  if (assocId) {
    query = query.eq('association_id', assocId);
  }

  const { data: logs, count } = await query.range(from, to);

  const actorIds = [
    ...new Set((logs ?? []).map((l) => l.actor_user_id).filter(Boolean)),
  ] as string[];

  const assocIds = [
    ...new Set((logs ?? []).map((l) => l.association_id).filter(Boolean)),
  ] as string[];

  // Only show associations that have at least one audit log entry ever.
  // Cap at 2000 rows - far more than any realistic association count - to
  // prevent an unbounded table scan on large audit_logs tables.
  const { data: activeAssocIdRows } = await adminClient
    .from('audit_logs')
    .select('association_id')
    .not('association_id', 'is', null)
    .limit(2000);
  const activeAssocIds = [
    ...new Set(
      (activeAssocIdRows ?? [])
        .map((r) => r.association_id)
        .filter(Boolean) as string[],
    ),
  ];

  const [profilesResult, assocResult, allAssocResult] = await Promise.all([
    actorIds.length > 0
      ? adminClient.from('profiles').select('id, full_name').in('id', actorIds)
      : Promise.resolve({ data: [] }),
    assocIds.length > 0
      ? adminClient
          .from('associations')
          .select('id, accounts!inner(name)')
          .in('id', assocIds)
      : Promise.resolve({ data: [] }),
    activeAssocIds.length > 0
      ? adminClient
          .from('associations')
          .select('id, accounts!inner(name)')
          .in('id', activeAssocIds)
          .order('id')
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

  const associations: AssocOption[] = (allAssocResult.data ?? []).map((a) => ({
    id: a.id,
    name: (a.accounts as { name?: string } | null)?.name ?? a.id.slice(0, 8),
  }));

  const rows: AdminActivityRow[] = (logs ?? []).map((l) => ({
    id: l.id,
    action: l.action,
    summary: l.summary,
    actor: l.actor_user_id
      ? (nameById.get(l.actor_user_id) ?? 'Unknown')
      : 'System',
    association: l.association_id
      ? (assocNameById.get(l.association_id) ?? l.association_id.slice(0, 8))
      : '-',
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
          isDefaultRange
            ? `Last ${DEFAULT_DAYS} days · ${totalCount} event${totalCount === 1 ? '' : 's'} · platform-wide`
            : `${effectiveDateFrom} to ${effectiveDateTo} · ${totalCount} event${totalCount === 1 ? '' : 's'} · platform-wide`
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
          dateFrom={effectiveDateFrom}
          dateTo={effectiveDateTo}
          isDefaultRange={isDefaultRange}
          assocId={assocId ?? ''}
          associations={associations}
        />
      </PageBody>
    </>
  );
}

export default AdminGuard(AdminActivityPage);
