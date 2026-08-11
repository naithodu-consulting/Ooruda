import { NotificationsPopover } from '@kit/notifications/components';

import featuresFlagConfig from '~/config/feature-flags.config';

export function TeamAccountNotifications(params: {
  userId: string;
  accountId: string;
  accountSlug: string;
}) {
  if (!featuresFlagConfig.enableNotifications) {
    return null;
  }

  return (
    <NotificationsPopover
      accountIds={[params.userId, params.accountId]}
      realtime={featuresFlagConfig.realtimeNotifications}
      accountSlug={params.accountSlug}
    />
  );
}
