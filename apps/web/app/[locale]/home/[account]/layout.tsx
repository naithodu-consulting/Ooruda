import { use } from 'react';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import * as z from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { TeamAccountWorkspaceContextProvider } from '@kit/team-accounts/components';
import { Page, PageNavigation } from '@kit/ui/page';
import { SidebarProvider } from '@kit/ui/sidebar';

import { getTeamAccountSidebarConfig } from '~/config/team-account-navigation.config';

// local imports
import { ConsentGate } from '../_components/consent-gate';
import { TeamAccountLayoutSidebar } from './_components/team-account-layout-sidebar';
import { TeamAccountNavigationMenu } from './_components/team-account-navigation-menu';
import { TeamAccountTopbar } from './_components/team-account-topbar';
import { loadTeamWorkspace } from './_lib/server/team-account-workspace.loader';

type TeamWorkspaceLayoutProps = React.PropsWithChildren<{
  params: Promise<{ account: string }>;
}>;

function TeamWorkspaceLayout({ children, params }: TeamWorkspaceLayoutProps) {
  const account = use(params).account;
  const state = use(getLayoutState(account));

  if (state.style === 'sidebar') {
    return <SidebarLayout account={account}>{children}</SidebarLayout>;
  }

  return <HeaderLayout account={account}>{children}</HeaderLayout>;
}

async function SidebarLayout({
  account,
  children,
}: React.PropsWithChildren<{
  account: string;
}>) {
  const [data, state] = await Promise.all([
    loadTeamWorkspace(account),
    getLayoutState(account),
  ]);

  if (!data) {
    redirect('/');
  }

  const accounts = data.accounts.map(({ name, slug, picture_url }) => ({
    label: name,
    value: slug,
    image: picture_url,
  }));

  // Load per-association feature flags and consent status in parallel.
  const client = getSupabaseServerClient();
  const [{ data: assocFlags }, { data: consentProfile }] = await Promise.all([
    client
      .from('associations')
      .select('cash_ledger_enabled')
      .eq('account_id', data.account.id)
      .single(),
    client
      .from('profiles')
      .select('consent_accepted_at')
      .eq('id', data.user.id)
      .single(),
  ]);

  const disabledNavKeys: string[] = [];
  if (assocFlags?.cash_ledger_enabled === false) {
    disabledNavKeys.push('association.nav.cashLedger');
  }

  return (
    <TeamAccountWorkspaceContextProvider value={data}>
      <SidebarProvider defaultOpen={state.open}>
        <Page style={'sidebar'}>
          <PageNavigation>
            <TeamAccountLayoutSidebar
              account={account}
              accountId={data.account.id}
              accounts={accounts}
              user={data.user}
              role={data.account.role}
              disabledNavKeys={disabledNavKeys}
            />
          </PageNavigation>

          <div className="dark:bg-background bg-muted/20 flex min-w-0 flex-1 flex-col">
            <div className="sticky top-0 z-50">
              <TeamAccountTopbar
                account={account}
                accountId={data.account.id}
                userId={data.user.id}
                role={data.account.role}
                accounts={accounts}
                user={data.user}
              />
            </div>

            {children}
          </div>
        </Page>
      </SidebarProvider>

      <ConsentGate consentRequired={!consentProfile?.consent_accepted_at} />
    </TeamAccountWorkspaceContextProvider>
  );
}

function HeaderLayout({
  account,
  children,
}: React.PropsWithChildren<{
  account: string;
}>) {
  const data = use(loadTeamWorkspace(account));

  return (
    <TeamAccountWorkspaceContextProvider value={data}>
      <Page style={'header'}>
        <PageNavigation>
          <TeamAccountNavigationMenu workspace={data} />
        </PageNavigation>

        {children}
      </Page>
    </TeamAccountWorkspaceContextProvider>
  );
}

async function getLayoutState(account: string) {
  const cookieStore = await cookies();
  const config = getTeamAccountSidebarConfig(account);

  const LayoutStyleSchema = z
    .enum(['sidebar', 'header', 'custom'])
    .default(config.style);

  const sidebarOpenCookie = cookieStore.get('sidebar_state');
  const layoutCookie = cookieStore.get('layout-style');

  const layoutStyle = LayoutStyleSchema.safeParse(layoutCookie?.value);

  const sidebarOpenCookieValue = sidebarOpenCookie
    ? sidebarOpenCookie.value === 'true'
    : !config.sidebarCollapsed;

  const style = layoutStyle.success ? layoutStyle.data : config.style;

  return {
    open: sidebarOpenCookieValue,
    style,
  };
}

export default TeamWorkspaceLayout;
