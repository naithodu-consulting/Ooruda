'use client';

import { useState } from 'react';

import dynamic from 'next/dynamic';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kit/ui/tabs';

import { ExpenseList } from './expense-list';

// Analytics is a secondary tab built on Recharts (~250 KB). Lazy-load it so
// the default list view doesn't pay for the chart library.
const ExpenseAnalytics = dynamic(
  () =>
    import('./expense-analytics').then((m) => ({
      default: m.ExpenseAnalytics,
    })),
  {
    ssr: false,
    loading: () => <div className="bg-muted h-64 animate-pulse rounded-lg" />,
  },
);

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
