'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kit/ui/tabs';

import {
  type CollectionRow,
  type MescomRow,
  type OutstandingBill,
  type PaymentRow,
  type UnitConsumptionRow,
} from '../_lib/reports-types';
import { CollectionTab } from './collection-tab';
import { ElectricityTab } from './electricity-tab';
import { ExportButton } from './export-button';
import { OutstandingTab } from './outstanding-tab';
import { PaymentsTab } from './payments-tab';

interface Props {
  associationId: string;
  from: string;
  to: string;
  activeTab: string;
  onTabChange: (tab: string) => void;
  collectionRows: CollectionRow[];
  outstandingBills: OutstandingBill[];
  payments: PaymentRow[];
  mescomRows: MescomRow[];
  consumptionByPeriod: Record<string, UnitConsumptionRow[]>;
}

const TABS = [
  { value: 'collection', label: 'Collection' },
  { value: 'outstanding', label: 'Outstanding' },
  { value: 'payments', label: 'Payments' },
  { value: 'electricity', label: 'Electricity' },
];

export function ReportsTabs({
  associationId,
  from,
  to,
  activeTab,
  onTabChange,
  collectionRows,
  outstandingBills,
  payments,
  mescomRows,
  consumptionByPeriod,
}: Props) {
  return (
    // Tab state is controlled externally — no router usage here
    <Tabs value={activeTab} onValueChange={onTabChange}>
      {/* Header: tabs + export — stacks on mobile */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="overflow-x-auto pb-0.5">
          <TabsList className="w-max">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <ExportButton
          associationId={associationId}
          from={from}
          to={to}
          activeTab={activeTab}
        />
      </div>

      <TabsContent value="collection">
        <CollectionTab rows={collectionRows} payments={payments} />
      </TabsContent>

      <TabsContent value="outstanding">
        <OutstandingTab bills={outstandingBills} />
      </TabsContent>

      <TabsContent value="payments">
        <PaymentsTab payments={payments} />
      </TabsContent>

      <TabsContent value="electricity">
        <ElectricityTab
          mescomRows={mescomRows}
          consumptionByPeriod={consumptionByPeriod}
        />
      </TabsContent>
    </Tabs>
  );
}
