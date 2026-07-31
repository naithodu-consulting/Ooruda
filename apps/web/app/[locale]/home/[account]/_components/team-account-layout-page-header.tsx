import { cookies } from 'next/headers';

import { PageHeader } from '@kit/ui/page';

import { getTeamAccountSidebarConfig } from '~/config/team-account-navigation.config';

export async function TeamAccountLayoutPageHeader(
  props: React.PropsWithChildren<{
    title: string | React.ReactNode;
    description: string | React.ReactNode;
    account: string;
  }>,
) {
  const cookieStore = await cookies();
  const layoutStyleCookie = cookieStore.get('layout-style')?.value;
  const defaultStyle = getTeamAccountSidebarConfig(props.account).style;
  const displaySidebarTrigger =
    (layoutStyleCookie ?? defaultStyle) === 'sidebar';

  return (
    <PageHeader
      title={props.title}
      description={props.description}
      displaySidebarTrigger={displaySidebarTrigger}
    >
      {props.children}
    </PageHeader>
  );
}
