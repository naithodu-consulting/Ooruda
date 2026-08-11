import { Bell, CircleDollarSign, Send } from 'lucide-react';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { MetricCard } from '@kit/ui/metric-card';
import { PageBody } from '@kit/ui/page';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kit/ui/tabs';
import { Trans } from '@kit/ui/trans';

import { hasMinimumRole, requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { MyAlertsCard } from './_components/my-alerts-card';
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
  const { role, accountId, userId } = await requireRole(account, [
    'assoc_admin',
    'billing_operator',
    'prop_owner',
    'tenant',
  ]);

  const isAdmin = hasMinimumRole(role, 'billing_operator');

  const client = getSupabaseServerClient();

  // My personal in-app alerts — all roles
  const myAlertsQuery = client
    .from('notifications')
    .select('id, type, body, link, dismissed, created_at')
    .eq('account_id', userId)
    .eq('channel', 'in_app')
    .eq('dismissed', false)
    .order('created_at', { ascending: false })
    .limit(50);

  // Outbound sent log — admins only
  const logsQuery = isAdmin
    ? client
        .from('associations')
        .select('id')
        .eq('account_id', accountId)
        .single()
    : null;

  const [myAlertsResult, assocResult] = await Promise.all([
    myAlertsQuery,
    logsQuery ?? Promise.resolve({ data: null }),
  ]);

  const myAlerts = myAlertsResult.data ?? [];

  let rows: NotificationLogRow[] = [];

  if (isAdmin && assocResult.data) {
    const { data: logs } = await client
      .from('notifications_log')
      .select(
        'id, type, recipient_user_id, channel, provider_key, status, sent_at',
      )
      .eq('association_id', assocResult.data.id)
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

    rows = (logs ?? []).map((l) => ({
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
  }

  const sentCount = rows.length;
  const billAlertCount = rows.filter((r) => r.type === 'bill_generated').length;
  const paymentAlertCount = rows.filter(
    (r) => r.type === 'payment_confirmed',
  ).length;

  const description = isAdmin
    ? `${myAlerts.length} unread alert${myAlerts.length === 1 ? '' : 's'} · ${rows.length} sent`
    : myAlerts.length === 0
      ? 'No new alerts'
      : `${myAlerts.length} unread alert${myAlerts.length === 1 ? '' : 's'}`;

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.notifications" />}
        description={description}
      />

      {isAdmin ? (
        <Tabs defaultValue="alerts">
          <TabsList className="mb-4">
            <TabsTrigger value="alerts" data-test="tab-my-alerts">
              My Alerts
              {myAlerts.length > 0 && (
                <span className="bg-primary text-primary-foreground ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold">
                  {myAlerts.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="sent-log" data-test="tab-sent-log">
              Sent Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="alerts">
            <MyAlertsCard alerts={myAlerts} />
          </TabsContent>

          <TabsContent value="sent-log">
            {rows.length > 0 && (
              <div className="mb-4 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                <MetricCard
                  icon={Send}
                  label="Total Sent"
                  value={String(sentCount)}
                  sublabel="SMS & email dispatched"
                  variant="blue"
                />
                <MetricCard
                  icon={Bell}
                  label="Bill Alerts"
                  value={String(billAlertCount)}
                  sublabel="Bills sent to owners & tenants"
                  variant="green"
                />
                <MetricCard
                  icon={CircleDollarSign}
                  label="Payment Alerts"
                  value={String(paymentAlertCount)}
                  sublabel="Receipt confirmations sent"
                  variant="amber"
                />
              </div>
            )}
            <NotificationsLogCard rows={rows} />
          </TabsContent>
        </Tabs>
      ) : (
        <MyAlertsCard alerts={myAlerts} />
      )}
    </PageBody>
  );
}
