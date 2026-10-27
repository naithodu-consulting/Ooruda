import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { PageBody } from '@kit/ui/page';

import { VILLA_ROLES, requireRole } from '~/lib/rbac';
import { activityLabel } from '~/lib/villa/labels';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import {
  ActivityLogTable,
  type ActivityRow,
} from './_components/activity-log-table';

export const metadata = { title: 'Activity Log' };

interface Props {
  params: Promise<{ account: string }>;
  searchParams: Promise<{ page?: string; search?: string }>;
}

const PAGE_SIZE = 25;

export default async function VillaActivityPage({
  params,
  searchParams,
}: Props) {
  const [{ account }, sp] = await Promise.all([params, searchParams]);
  const { role, accountId, userId } = await requireRole(
    account,
    VILLA_ROLES,
    'villa',
  );

  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const search = (sp.search ?? '').trim();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const client = getSupabaseServerClient();

  let query = client
    .from('villa_booking_activity')
    .select(
      `id, action, reason_code, note, actor_user_id,
       site_booking_id, property_id, created_at,
       villa_cancellation_reasons(label),
       villa_properties(name)`,
      { count: 'exact' },
    )
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  // villa_manager only sees their own actions.
  if (role === 'villa_manager') {
    query = query.eq('actor_user_id', userId);
  }

  if (search) {
    query = query.ilike('action', `%${search}%`);
  }

  const { data: activities, count } = await query.range(from, to);

  const actorIds = [
    ...new Set(
      (activities ?? []).map((a) => a.actor_user_id).filter(Boolean),
    ),
  ] as string[];

  const { data: profiles } =
    actorIds.length > 0
      ? await getSupabaseServerAdminClient()
          .from('profiles')
          .select('id, full_name')
          .in('id', actorIds)
      : { data: [] };

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const rows: ActivityRow[] = (activities ?? []).map((a) => {
    const reasons = a.villa_cancellation_reasons;
    const reasonLabel =
      reasons && !Array.isArray(reasons)
        ? (reasons as { label: string }).label
        : Array.isArray(reasons) && reasons.length > 0
          ? (reasons[0] as { label: string }).label
          : null;

    const property = a.villa_properties;
    const propertyName =
      property && !Array.isArray(property)
        ? (property as { name: string }).name
        : Array.isArray(property) && property.length > 0
          ? (property[0] as { name: string }).name
          : null;

    return {
      id: a.id,
      action: a.action,
      actionLabel: activityLabel(a.action),
      reasonLabel,
      note: a.note ?? null,
      actorName: a.actor_user_id
        ? (nameById.get(a.actor_user_id) ?? 'Unknown')
        : 'System',
      bookingId: a.site_booking_id,
      propertyId: a.property_id,
      propertyName,
      createdAt: a.created_at,
    };
  });

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const description =
    role === 'villa_manager'
      ? `Your activity · ${totalCount} event${totalCount === 1 ? '' : 's'} · most recent first`
      : `${totalCount} event${totalCount === 1 ? '' : 's'} · most recent first`;

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title="Activity Log"
        description={description}
      />

      <ActivityLogTable
        account={account}
        rows={rows}
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={PAGE_SIZE}
        search={search}
        isAdmin={role === 'villa_admin'}
      />
    </PageBody>
  );
}
