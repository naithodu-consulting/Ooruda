import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import {
  NotificationsLogCard,
  type NotificationLogRow,
} from './_components/notifications-log-card';

interface Props {
  params: Promise<{ account: string }>;
}

export const metadata = { title: 'Notifications' };

export default async function NotificationsPage({ params }: Props) {
  const { account } = await params;
  const { accountId } = await requireRole(account, [
    'assoc_admin',
    'billing_operator',
  ]);

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
    .from('notifications_log')
    .select(
      'id, type, recipient_user_id, channel, provider_key, status, sent_at, provider_ref',
    )
    .eq('association_id', association.id)
    .order('sent_at', { ascending: false })
    .limit(100);

  const recipientIds = [
    ...new Set((logs ?? []).map((l) => l.recipient_user_id).filter(Boolean)),
  ] as string[];

  const { data: profiles } =
    recipientIds.length > 0
      ? await client
          .from('profiles')
          .select('id, full_name')
          .in('id', recipientIds)
      : { data: [] };

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const rows: NotificationLogRow[] = (logs ?? []).map((l) => ({
    id: l.id,
    type: l.type,
    recipient: l.recipient_user_id
      ? (nameById.get(l.recipient_user_id) ?? 'Unknown')
      : '—',
    channel: l.channel,
    provider_key: l.provider_key,
    status: l.status,
    sent_at: l.sent_at,
  }));

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.notifications" />}
        description={<AppBreadcrumbs />}
      />

      <NotificationsLogCard rows={rows} />
    </PageBody>
  );
}
