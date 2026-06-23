import { JWTUserData } from '@kit/supabase/types';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from '@kit/ui/sidebar';

import type { AccountModel } from '~/components/workspace-dropdown';
import { WorkspaceDropdown } from '~/components/workspace-dropdown';
import {
  filterSidebarConfigByRole,
  getTeamAccountSidebarConfig,
} from '~/config/team-account-navigation.config';

import { TeamAccountLayoutSidebarNavigation } from './team-account-layout-sidebar-navigation';
import { TeamAccountSidebarBrand } from './team-account-sidebar-brand';

export function TeamAccountLayoutSidebar(props: {
  account: string;
  accountId: string;
  accounts: AccountModel[];
  user: JWTUserData;
  role: string | null;
}) {
  const { account, accounts, user, role } = props;

  const config = filterSidebarConfigByRole(
    getTeamAccountSidebarConfig(account),
    role,
  );
  const collapsible = config.sidebarCollapsedStyle;

  return (
    <Sidebar variant="floating" collapsible={collapsible}>
      <SidebarHeader className={'h-16 justify-center'}>
        <TeamAccountSidebarBrand />
      </SidebarHeader>

      <SidebarContent className="h-[calc(100%-160px)] overflow-y-auto">
        <TeamAccountLayoutSidebarNavigation config={config} />
      </SidebarContent>

      <SidebarFooter className="border-t border-[#1F2D3D] p-2">
        <WorkspaceDropdown
          user={user}
          accounts={accounts}
          selectedAccount={account}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
