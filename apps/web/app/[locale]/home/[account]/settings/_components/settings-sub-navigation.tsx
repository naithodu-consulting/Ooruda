'use client';

import {
  BorderedNavigationMenu,
  BorderedNavigationMenuItem,
} from '@kit/ui/bordered-navigation-menu';

import pathsConfig from '~/config/paths.config';

export function SettingsSubNavigation(props: { account: string }) {
  const settingsPath = pathsConfig.app.accountSettings.replace(
    '[account]',
    props.account,
  );

  const profilePath = pathsConfig.app.accountProfileSettings.replace(
    '[account]',
    props.account,
  );

  const associationPath = pathsConfig.app.accountAssociationSettings.replace(
    '[account]',
    props.account,
  );

  return (
    <BorderedNavigationMenu>
      <BorderedNavigationMenuItem
        path={settingsPath}
        label={'common.routes.settings'}
        highlightMatch={`/home/${props.account}/settings$`}
      />

      <BorderedNavigationMenuItem
        path={associationPath}
        label={'association.settings.pageTitle'}
      />

      <BorderedNavigationMenuItem
        path={profilePath}
        label={'common.routes.profile'}
      />
    </BorderedNavigationMenu>
  );
}
