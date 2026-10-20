import { getTranslations } from 'next-intl/server';

import { PersonalAccountSettingsContainer } from '@kit/accounts/personal-account-settings';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import authConfig from '~/config/auth.config';
import featureFlagsConfig from '~/config/feature-flags.config';
import pathsConfig from '~/config/paths.config';
import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

import { LoginSecurityCard } from './_components/login-security-card';

// Email/phone changes are owned by the LoginSecurityCard below (code-verified,
// keeps profiles in sync), so MakerKit's own editors are hidden:
// - email update: a second email editor using a different (link) flow.
// - linked accounts: identity linking is off and there are no OAuth
//   providers, so it could only unlink the phone/email sign-in methods.
// - MFA: sign-in is already a one-time code; authenticator-app MFA has no
//   recovery path for owners/tenants yet. Hidden, not removed - revisit with
//   an admin reset flow.
const features = {
  showLinkEmailOption: false,
  showEmailUpdate: false,
  showLinkedAccounts: false,
  showMultiFactorAuth: false,
  enablePasswordUpdate: authConfig.providers.password,
  enableAccountDeletion: featureFlagsConfig.enableAccountDeletion,
  enableAccountLinking: authConfig.enableIdentityLinking,
};

const providers = authConfig.providers.oAuth;

export const generateMetadata = async () => {
  const t = await getTranslations('account');
  const title = t('settingsTab');

  return {
    title,
  };
};

interface TeamProfileSettingsPageProps {
  params: Promise<{ account: string }>;
}

async function TeamProfileSettingsPage({
  params,
}: TeamProfileSettingsPageProps) {
  const [user, { account }] = await Promise.all([
    requireUserInServerComponent(),
    params,
  ]);

  // Current login identities for the self-service Login & Security card. The
  // canonical phone is '+91…'; surface the local 10-digit part for display.
  const client = getSupabaseServerClient();
  const { data: profile } = await client
    .from('profiles')
    .select('mobile_number, email')
    .eq('id', user.id)
    .maybeSingle();

  const profilePath = pathsConfig.app.accountProfileSettings.replace(
    '[account]',
    account,
  );

  const paths = {
    callback: pathsConfig.auth.callback + `?next=${profilePath}`,
  };

  return (
    <div className={'flex w-full flex-1 flex-col gap-6 lg:max-w-2xl'}>
      <LoginSecurityCard
        phone={profile?.mobile_number ?? null}
        email={profile?.email ?? null}
      />

      <PersonalAccountSettingsContainer
        userId={user.id}
        features={features}
        paths={paths}
        providers={providers}
      />
    </div>
  );
}

export default TeamProfileSettingsPage;
