'use client';

import { useState } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kit/ui/tabs';

import { AmcDashboard } from './amc-dashboard';
import { AmcList } from './amc-list';
import { AmcSettings } from './amc-settings';

export interface AmcContractRow {
  id: string;
  name: string;
  vendor_name: string;
  category: string;
  start_date: string;
  end_date: string;
  contract_value: number;
  payment_frequency: string;
  priority: string;
  auto_renewal: boolean;
  terminated_at: string | null;
  status:
    | 'active'
    | 'due_soon'
    | 'urgent'
    | 'critical'
    | 'expired'
    | 'terminated';
}

export interface DashboardStats {
  active: number;
  dueSoon: number;
  urgent: number;
  critical: number;
  expired: number;
  totalAnnualCost: number;
  needsAttention: AmcContractRow[];
  all: AmcContractRow[];
}

interface Props {
  associationId: string;
  accountSlug: string;
  stats: DashboardStats;
  reminderSettings: { remindDaysBefore: number };
  defaultTab: string;
}

export function AmcPageClient({
  associationId,
  accountSlug,
  stats,
  reminderSettings,
  defaultTab,
}: Props) {
  const [activeTab, setActiveTab] = useState(
    defaultTab === 'settings'
      ? 'settings'
      : defaultTab === 'list'
        ? 'list'
        : 'dashboard',
  );

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className={'w-full'}>
      <TabsList className={'mb-4'}>
        <TabsTrigger value={'dashboard'} data-test={'amc-tab-dashboard'}>
          Dashboard
        </TabsTrigger>
        <TabsTrigger value={'list'} data-test={'amc-tab-list'}>
          All Contracts
        </TabsTrigger>
        <TabsTrigger value={'settings'} data-test={'amc-tab-settings'}>
          Reminder Settings
        </TabsTrigger>
      </TabsList>

      <TabsContent value={'dashboard'} className={'mt-0'}>
        <AmcDashboard
          associationId={associationId}
          accountSlug={accountSlug}
          stats={stats}
        />
      </TabsContent>

      <TabsContent value={'list'} className={'mt-0'}>
        <AmcList
          associationId={associationId}
          accountSlug={accountSlug}
          initialContracts={stats.all}
        />
      </TabsContent>

      <TabsContent value={'settings'} className={'mt-0'}>
        <AmcSettings
          associationId={associationId}
          remindDaysBefore={reminderSettings.remindDaysBefore}
        />
      </TabsContent>
    </Tabs>
  );
}
