'use client';

import { useState } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kit/ui/tabs';

import { ExpenseAnalytics } from './expense-analytics';
import { ExpenseList } from './expense-list';

interface Category {
  id: string;
  name: string;
}
interface Vendor {
  id: string;
  name: string;
}

export interface ExpenseRow {
  id: string;
  title: string;
  amount: number;
  gst_amount: number | null;
  payor: string;
  payee_name: string;
  mode_of_payment: string;
  reference_number: string | null;
  invoice_number: string | null;
  date_of_payment: string;
  notes: string | null;
  recurring: boolean;
  attachment_url: string | null;
  created_at: string;
  category: { id: string; name: string } | null;
}

interface Props {
  associationId: string;
  accountSlug: string;
  initialExpenses: ExpenseRow[];
  totalCount: number;
  categories: Category[];
  vendors: Vendor[];
  defaultTab: string;
}

export function ExpensesPageClient({
  associationId,
  accountSlug,
  initialExpenses,
  totalCount,
  categories,
  vendors,
  defaultTab,
}: Props) {
  const [activeTab, setActiveTab] = useState(
    defaultTab === 'analytics' ? 'analytics' : 'list',
  );

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className={'w-full'}>
      <TabsList className={'mb-4'}>
        <TabsTrigger value={'list'} data-test={'expenses-tab-list'}>
          Expenses
        </TabsTrigger>
        <TabsTrigger value={'analytics'} data-test={'expenses-tab-analytics'}>
          Analytics
        </TabsTrigger>
      </TabsList>

      <TabsContent value={'list'} className={'mt-0'}>
        <ExpenseList
          associationId={associationId}
          accountSlug={accountSlug}
          initialExpenses={initialExpenses}
          totalCount={totalCount}
          categories={categories}
          vendors={vendors}
        />
      </TabsContent>

      <TabsContent value={'analytics'} className={'mt-0'}>
        <ExpenseAnalytics associationId={associationId} />
      </TabsContent>
    </Tabs>
  );
}
