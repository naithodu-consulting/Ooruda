import { redirect } from 'next/navigation';

import pathsConfig from '~/config/paths.config';

interface TeamAccountSettingsPageProps {
  params: Promise<{ account: string }>;
}

// `/settings` no longer renders its own content - the team-name/logo/danger-zone
// fields it used to show were merged into the Association Settings tab (which
// was duplicating the same accounts.picture_url logo and split identity across
// two tabs). Redirect so existing links and nav items keep working.
async function TeamAccountSettingsPage(props: TeamAccountSettingsPageProps) {
  const { account } = await props.params;

  redirect(
    pathsConfig.app.accountAssociationSettings.replace('[account]', account),
  );
}

export default TeamAccountSettingsPage;
