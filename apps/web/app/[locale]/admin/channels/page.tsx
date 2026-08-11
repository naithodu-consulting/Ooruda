import { notFound } from 'next/navigation';

import { AdminGuard } from '@kit/admin/components/admin-guard';
import { PageBody, PageHeader } from '@kit/ui/page';

import { NotificationSettingsClient } from './_components/notification-settings-client';
import { getNotificationSettingsAction } from './_lib/notification-settings-actions';

export const metadata = { title: 'Communication Channels' };
export const dynamic = 'force-dynamic';

async function NotificationSettingsPage() {
  if (process.env.NEXT_PUBLIC_ENABLE_SMS_EMAIL_NOTIFICATIONS !== 'true') {
    notFound();
  }

  const settings = await getNotificationSettingsAction();

  return (
    <>
      <PageHeader
        title="Communication Channels"
        description="Enable or disable outbound communication channels (SMS, Email) for automated alerts across all associations."
      />

      <PageBody>
        <div className="max-w-3xl space-y-6">
          <NotificationSettingsClient initialSettings={settings} />
        </div>
      </PageBody>
    </>
  );
}

export default AdminGuard(NotificationSettingsPage);
