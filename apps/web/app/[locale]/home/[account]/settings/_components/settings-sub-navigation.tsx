'use client';

import {
  BorderedNavigationMenu,
  BorderedNavigationMenuItem,
} from '@kit/ui/bordered-navigation-menu';

import pathsConfig from '~/config/paths.config';

export function SettingsSubNavigation(props: { account: string }) {
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
        path={associationPath}
        label={'association.label'}
      />

      <BorderedNavigationMenuItem
        path={profilePath}
        label={'common.routes.profile'}
      />
    </BorderedNavigationMenu>
  );
}
