import { use } from 'react';

import { cookies } from 'next/headers';

import { Page, PageNavigation } from '@kit/ui/page';
import { SidebarProvider } from '@kit/ui/sidebar';

import { AdminSidebar } from '~/admin/_components/admin-sidebar';
import { AdminTopbar } from '~/admin/_components/admin-topbar';

export const metadata = {
  title: `Super Admin`,
};

export const dynamic = 'force-dynamic';

export default function AdminLayout(props: React.PropsWithChildren) {
  const state = use(getLayoutState());

  return (
    <SidebarProvider defaultOpen={state.open}>
      <Page style={'sidebar'}>
        <PageNavigation>
          <AdminSidebar />
        </PageNavigation>

        {/* Children slot: unified topbar + page content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopbar />
          {props.children}
        </div>
      </Page>
    </SidebarProvider>
  );
}

async function getLayoutState() {
  const cookieStore = await cookies();
  const sidebarOpenCookie = cookieStore.get('sidebar_state');

  return {
    open: sidebarOpenCookie ? sidebarOpenCookie.value === 'true' : true,
  };
}
