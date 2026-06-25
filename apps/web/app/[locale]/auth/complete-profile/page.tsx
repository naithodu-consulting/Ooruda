import { redirect } from 'next/navigation';

import { getTranslations } from 'next-intl/server';

import { getSafeRedirectPath } from '@kit/shared/utils';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import pathsConfig from '~/config/paths.config';

import { CompleteProfileForm } from './_components/complete-profile-form';

interface Props {
  searchParams: Promise<{ next?: string }>;
}

export const generateMetadata = async () => {
  const t = await getTranslations('auth');

  return {
    title: t('completeProfileHeading'),
  };
};

async function CompleteProfilePage(props: Props) {
  const client = getSupabaseServerClient();

  const { data } = await client.auth.getClaims();

  // Not logged in → back to sign-in.
  if (!data?.claims) {
    redirect(pathsConfig.auth.signIn);
  }

  const nextPath = getSafeRedirectPath(
    (await props.searchParams).next,
    pathsConfig.app.home,
  );

  // Already has an email → nothing to complete; continue into the app.
  if (data.claims.email) {
    redirect(nextPath);
  }

  return <CompleteProfileForm redirectPath={nextPath} />;
}

export default CompleteProfilePage;
