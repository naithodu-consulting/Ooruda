import {
  Activity,
  Bell,
  Building2,
  CreditCard,
  FileText,
  LayoutDashboard,
  Settings,
  Users,
  Zap,
} from 'lucide-react';

import { NavigationConfigSchema } from '@kit/ui/navigation-schema';

import pathsConfig from '~/config/paths.config';

const iconClasses = 'w-4';

const getRoutes = (account: string) => [
  {
    label: 'association.nav.portfolio',
    children: [
      {
        label: 'association.nav.dashboard',
        path: pathsConfig.app.accountHome.replace('[account]', account),
        Icon: <LayoutDashboard className={iconClasses} />,
        highlightMatch: `${pathsConfig.app.home}$`,
      },
    ],
  },
  {
    label: 'association.nav.operations',
    children: [
      {
        label: 'association.nav.units',
        path: `${pathsConfig.app.accountHome.replace('[account]', account)}/units`,
        Icon: <Building2 className={iconClasses} />,
      },
      {
        label: 'association.nav.billing',
        path: `${pathsConfig.app.accountHome.replace('[account]', account)}/billing`,
        Icon: <FileText className={iconClasses} />,
      },
      {
        label: 'association.nav.mescom',
        path: `${pathsConfig.app.accountHome.replace('[account]', account)}/mescom`,
        Icon: <Zap className={iconClasses} />,
      },
      {
        label: 'association.nav.payments',
        path: `${pathsConfig.app.accountHome.replace('[account]', account)}/payments`,
        Icon: <CreditCard className={iconClasses} />,
      },
    ],
  },
  {
    label: 'association.nav.insights',
    children: [
      {
        label: 'association.nav.reports',
        path: `${pathsConfig.app.accountHome.replace('[account]', account)}/reports`,
        Icon: <Activity className={iconClasses} />,
      },
      {
        label: 'association.nav.notifications',
        path: `${pathsConfig.app.accountHome.replace('[account]', account)}/notifications`,
        Icon: <Bell className={iconClasses} />,
      },
    ],
  },
  {
    label: 'association.nav.admin',
    children: [
      {
        label: 'association.nav.members',
        path: pathsConfig.app.accountMembers.replace('[account]', account),
        Icon: <Users className={iconClasses} />,
      },
      {
        label: 'association.nav.settings',
        path: pathsConfig.app.accountSettings.replace('[account]', account),
        Icon: <Settings className={iconClasses} />,
      },
    ],
  },
];

export function getTeamAccountSidebarConfig(account: string) {
  return NavigationConfigSchema.parse({
    routes: getRoutes(account),
    style: process.env.NEXT_PUBLIC_TEAM_NAVIGATION_STYLE,
    sidebarCollapsed: process.env.NEXT_PUBLIC_TEAM_SIDEBAR_COLLAPSED,
    sidebarCollapsedStyle: process.env.NEXT_PUBLIC_SIDEBAR_COLLAPSIBLE_STYLE,
  });
}
