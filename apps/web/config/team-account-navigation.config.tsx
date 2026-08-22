import {
  Activity,
  Bell,
  Building2,
  CalendarClock,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  Receipt,
  ScrollText,
  Settings,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';

import { NavigationConfigSchema } from '@kit/ui/navigation-schema';

import pathsConfig from '~/config/paths.config';

const iconClasses = 'w-4 h-4 shrink-0';

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
        path: `${pathsConfig.app.accountHome.replace('[account]', account)}/electricity`,
        Icon: <Zap className={iconClasses} />,
      },
      {
        label: 'association.nav.payments',
        path: `${pathsConfig.app.accountHome.replace('[account]', account)}/payments`,
        Icon: <CreditCard className={iconClasses} />,
      },
      {
        label: 'association.nav.cashLedger',
        path: `${pathsConfig.app.accountHome.replace('[account]', account)}/cash-ledger`,
        Icon: <Wallet className={iconClasses} />,
      },
      {
        label: 'association.nav.statement',
        path: `${pathsConfig.app.accountHome.replace('[account]', account)}/statement`,
        Icon: <ScrollText className={iconClasses} />,
      },
      {
        label: 'association.nav.expenses',
        path: `${pathsConfig.app.accountHome.replace('[account]', account)}/expenses`,
        Icon: <Receipt className={iconClasses} />,
      },
      {
        label: 'association.nav.amc',
        path: `${pathsConfig.app.accountHome.replace('[account]', account)}/amc`,
        Icon: <CalendarClock className={iconClasses} />,
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
    ],
  },
  {
    label: 'association.nav.admin',
    children: [
      {
        label: 'association.nav.notifications',
        path: `${pathsConfig.app.accountHome.replace('[account]', account)}/notifications`,
        Icon: <Bell className={iconClasses} />,
      },
      {
        label: 'association.nav.audit',
        path: `${pathsConfig.app.accountHome.replace('[account]', account)}/audit`,
        Icon: <ClipboardList className={iconClasses} />,
      },
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

// Which nav items each Ooruda role may see (by i18n label key). Owners and
// tenants get a minimal portal (dashboard + payments) per the prototype;
// billing operators see operations + insights but not the Admin section;
// assoc_admin sees everything. The platform super admin uses /admin, not this
// team-workspace nav, so it isn't listed here.
const ROLE_NAV_ALLOWLIST: Record<string, readonly string[] | '*'> = {
  assoc_admin: [
    'association.nav.dashboard',
    'association.nav.units',
    'association.nav.billing',
    'association.nav.mescom',
    'association.nav.payments',
    'association.nav.cashLedger',
    'association.nav.reports',
    'association.nav.notifications',
    'association.nav.audit',
    'association.nav.members',
    'association.nav.settings',
    'association.nav.expenses',
    'association.nav.amc',
  ],
  billing_operator: [
    'association.nav.dashboard',
    'association.nav.units',
    'association.nav.billing',
    'association.nav.mescom',
    'association.nav.payments',
    'association.nav.cashLedger',
    'association.nav.reports',
    'association.nav.expenses',
  ],
  prop_owner: [
    'association.nav.dashboard',
    'association.nav.payments',
    'association.nav.statement',
  ],
  tenant: [
    'association.nav.dashboard',
    'association.nav.payments',
    'association.nav.statement',
  ],
};

type SidebarConfig = ReturnType<typeof getTeamAccountSidebarConfig>;

/**
 * Filter a sidebar config down to the nav items the given role may see,
 * dropping any section left with no visible children. Pages remain protected
 * by requireRole() regardless — this only controls what the sidebar shows.
 */
export function filterSidebarConfigByRole(
  config: SidebarConfig,
  role: string | null | undefined,
  disabledNavKeys: string[] = [],
): SidebarConfig {
  const allowed = role ? ROLE_NAV_ALLOWLIST[role] : undefined;

  const routes = config.routes
    .map((section) => {
      if (!('children' in section) || !Array.isArray(section.children)) {
        return section;
      }

      return {
        ...section,
        children: section.children.filter((item) => {
          if (!('label' in item)) return false;
          const label = item.label as string;
          if (disabledNavKeys.includes(label)) return false;
          // unknown role or full access → only apply disabled keys filter
          if (!allowed || allowed === '*') return true;
          return allowed.includes(label);
        }),
      };
    })
    .filter(
      (section) =>
        !('children' in section) ||
        (Array.isArray(section.children) && section.children.length > 0),
    );

  return { ...config, routes };
}
