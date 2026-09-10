'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';

import { PersonalAccountDropdown } from '@kit/accounts/personal-account-dropdown';
import { useSignOut } from '@kit/supabase/hooks/use-sign-out';
import { JWTUserData } from '@kit/supabase/types';
import { Button } from '@kit/ui/button';
import { If } from '@kit/ui/if';
import { Trans } from '@kit/ui/trans';

import featuresFlagConfig from '~/config/feature-flags.config';
import pathsConfig from '~/config/paths.config';

const ModeToggle = dynamic(
  () =>
    import('@kit/ui/mode-toggle').then((mod) => ({
      default: mod.ModeToggle,
    })),
  { ssr: false },
);

const MobileModeToggle = dynamic(
  () =>
    import('@kit/ui/mobile-mode-toggle').then((mod) => ({
      default: mod.MobileModeToggle,
    })),
  { ssr: false },
);

const paths = {
  home: pathsConfig.app.home,
  profileSettings: pathsConfig.app.personalAccountSettings,
};

const features = {
  enableThemeToggle: featuresFlagConfig.enableThemeToggle,
};

export function SiteHeaderAccountSection({
  user,
}: {
  user: JWTUserData | null;
}) {
  const signOut = useSignOut();

  if (user) {
    return (
      <PersonalAccountDropdown
        showProfileName={false}
        paths={paths}
        features={features}
        user={user}
        signOutRequested={() => signOut.mutateAsync()}
      />
    );
  }

  return <AuthButtons />;
}

function AuthButtons() {
  return (
    <div
      className={'animate-in fade-in flex items-center gap-x-2 duration-500'}
    >
      <div className={'hidden md:flex'}>
        <If condition={features.enableThemeToggle}>
          <ModeToggle />
        </If>
      </div>

      <div className={'md:hidden'}>
        <If condition={features.enableThemeToggle}>
          <MobileModeToggle />
        </If>
      </div>

      {/*
        No sign-up button: Ooruda onboards residents and admins through an
        association invitation, so there is no self-serve registration to
        offer a visitor reading a legal page.
      */}
      <div className={'flex items-center gap-x-2'}>
        <Button
          nativeButton={false}
          render={
            <Link href={pathsConfig.auth.signIn}>
              <Trans i18nKey={'auth.signIn'} />
            </Link>
          }
          className={'text-xs md:text-sm'}
          variant={'default'}
          size={'sm'}
        />
      </div>
    </div>
  );
}
