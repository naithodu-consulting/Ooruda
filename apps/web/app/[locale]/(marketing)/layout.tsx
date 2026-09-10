import { Suspense } from 'react';

import { requireUser } from '@kit/supabase/require-user';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { SiteFooter } from '~/(marketing)/_components/site-footer';
import { SiteHeader } from '~/(marketing)/_components/site-header';

function SiteLayout(props: React.PropsWithChildren) {
  return (
    <div className={'flex min-h-screen flex-col'}>
      <Suspense fallback={<SiteHeader user={null} />}>
        <AuthenticatedSiteHeader />
      </Suspense>

      {props.children}

      <SiteFooter />
    </div>
  );
}

async function AuthenticatedSiteHeader() {
  const client = getSupabaseServerClient();
  const { data: user } = await requireUser(client, { verifyMfa: false });

  return <SiteHeader user={user ?? null} />;
}

export default SiteLayout;
