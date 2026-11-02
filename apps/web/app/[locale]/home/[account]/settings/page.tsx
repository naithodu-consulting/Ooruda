import { redirect } from 'next/navigation';

import pathsConfig from '~/config/paths.config';
import { getAccountContext } from '~/lib/rbac';

interface TeamAccountSettingsPageProps {
  params: Promise<{ account: string }>;
}

// `/settings` redirects to the product-specific settings page:
// - Villa accounts go to `/villa-settings`
// - Association accounts go to `/settings/association`
async function TeamAccountSettingsPage(props: TeamAccountSettingsPageProps) {
  const { account } = await props.params;
  const { productType } = await getAccountContext(account);

  if (productType === 'villa') {
    redirect(
      pathsConfig.app.accountVillaSettings.replace('[account]', account),
    );
  }

  redirect(
    pathsConfig.app.accountAssociationSettings.replace('[account]', account),
  );
}

export default TeamAccountSettingsPage;
