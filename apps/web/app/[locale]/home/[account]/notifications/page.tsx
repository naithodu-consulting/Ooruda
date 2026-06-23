import { Bell, BellRing, Send } from 'lucide-react';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { MetricCard } from '@kit/ui/metric-card';
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

  const sentCount = rows.filter(
    (r) => r.status === 'Sent' || r.status === 'Delivered',
  ).length;
  const deliveredCount = rows.filter((r) => r.status === 'Delivered').length;
  const reminderCount = rows.filter((r) => r.type === 'Reminder').length;

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.notifications" />}
        description={
          rows.length === 0
            ? 'No notifications sent yet'
            : `${rows.length} notifications · ${deliveredCount} delivered`
        }
      />

      {rows.length > 0 ? (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <MetricCard
            icon={Send}
            label="Sent"
            value={String(sentCount)}
            sublabel="Out for delivery"
            variant="blue"
          />
          <MetricCard
            icon={BellRing}
            label="Delivered"
            value={String(deliveredCount)}
            sublabel={
              sentCount === 0
                ? '0% delivered'
                : `${Math.round((deliveredCount / sentCount) * 100)}% delivered`
            }
            variant="green"
          />
          <MetricCard
            icon={Bell}
            label="Reminders"
            value={String(reminderCount)}
            sublabel="Payment reminders sent"
            variant="amber"
          />
        </div>
      ) : null}

      <NotificationsLogCard rows={rows} />
    </PageBody>
  );
}
