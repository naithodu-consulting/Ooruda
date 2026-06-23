import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { PageBody } from '@kit/ui/page';

import { ROLE_LABELS, type PropOpsRole, requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { AuditLogCard, type AuditLogRow } from './_components/audit-log-card';

interface Props {
  params: Promise<{ account: string }>;
}

export const metadata = { title: 'Audit log' };

export default async function AuditPage({ params }: Props) {
  const { account } = await params;
  const { accountId } = await requireRole(account, ['assoc_admin']);

  const client = getSupabaseServerClient();

  const { data: association } = await client
    .from('associations')
    .select('id')
    .eq('account_id', accountId)
    .single();

  if (!association) {
    throw new Error('Unable to load the association for this account.');
  }

  const { data: logs } = await client
    .from('audit_logs')
    .select('id, action, entity_type, summary, actor_user_id, created_at')
    .eq('association_id', association.id)
    .order('created_at', { ascending: false })
    .limit(200);

  const actorIds = [
    ...new Set((logs ?? []).map((l) => l.actor_user_id).filter(Boolean)),
  ] as string[];

  const { data: profiles } =
    actorIds.length > 0
      ? await client.from('profiles').select('id, full_name').in('id', actorIds)
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
      ? (roleLabelById.get(l.actor_user_id) ?? null)
      : null,
    created_at: l.created_at,
  }));

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title="Audit log"
        description={
          rows.length === 0
            ? 'Nothing logged yet'
            : `${rows.length} events · most recent first`
        }
      />

      <AuditLogCard rows={rows} />
    </PageBody>
  );
}
