import { use } from 'react';

import { getTranslations } from 'next-intl/server';

import { PersonalAccountSettingsContainer } from '@kit/accounts/personal-account-settings';

import authConfig from '~/config/auth.config';
import featureFlagsConfig from '~/config/feature-flags.config';
import pathsConfig from '~/config/paths.config';
import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

import { AuthHashStatusListener } from './_components/auth-hash-status-listener';

// Show email option if password, magic link, or OTP is enabled
const showEmailOption =
  authConfig.providers.password ||
  authConfig.providers.magicLink ||
  authConfig.providers.otp;

const features = {
  showLinkEmailOption: showEmailOption,
  enablePasswordUpdate: authConfig.providers.password,
  enableAccountDeletion: featureFlagsConfig.enableAccountDeletion,
  enableAccountLinking: authConfig.enableIdentityLinking,
  // Same reasoning as the team profile settings page: no OAuth providers to
  // link (only risky unlinks), and no MFA recovery path yet.
  showLinkedAccounts: false,
  showMultiFactorAuth: false,
};

const providers = authConfig.providers.oAuth;

const callbackPath = pathsConfig.auth.callback;
const accountSettingsPath = pathsConfig.app.personalAccountSettings;

const paths = {
  callback: callbackPath + `?next=${accountSettingsPath}`,
};

export const generateMetadata = async () => {
  const t = await getTranslations('account');
  const title = t('settingsTab');

  return {
    title,
  };
};

function PersonalAccountSettingsPage() {
  const user = use(requireUserInServerComponent());

  return (
    <div className={'flex w-full flex-1 flex-col lg:max-w-2xl'}>
      <AuthHashStatusListener />

      <PersonalAccountSettingsContainer
        userId={user.id}
        phone={user.phone}
        features={features}
        paths={paths}
        providers={providers}
      />
    </div>
  );
}

export default PersonalAccountSettingsPage;
