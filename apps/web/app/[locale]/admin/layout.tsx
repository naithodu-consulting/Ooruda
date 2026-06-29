import { use } from 'react';

import { cookies } from 'next/headers';

import { Page, PageNavigation } from '@kit/ui/page';
import { SidebarProvider } from '@kit/ui/sidebar';

import { AdminSidebar } from '~/admin/_components/admin-sidebar';
import { AdminMobileNavigation } from '~/admin/_components/mobile-navigation';
import { AppLogo } from '~/components/app-logo';

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

        {/* Children slot: mobile topbar + page content */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile-only topbar — hidden on lg+ where the sidebar is visible */}
          <div className="flex items-center justify-between border-b px-4 py-2 lg:hidden">
            <AppLogo href="/admin" />
            <AdminMobileNavigation />
          </div>

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
