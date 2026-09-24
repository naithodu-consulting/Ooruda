import { redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { PageBody } from '@kit/ui/page';

import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { loadAssociationFeatures } from '../_lib/server/association-features.loader';
import { ExpensesPageClient } from './_components/expenses-page-client';

interface Props {
  params: Promise<{ account: string }>;
  searchParams: Promise<{
    tab?: string;
    from?: string;
    to?: string;
    category?: string;
    mode?: string;
    search?: string;
  }>;
}

export const metadata = { title: 'Expense Tracker' };

export default async function ExpensesPage({ params, searchParams }: Props) {
  const [{ account }, sp] = await Promise.all([params, searchParams]);

  const { associationId } = await requireRole(account, [
    'assoc_admin',
    'billing_operator',
  ]);

  const client = getSupabaseServerClient();

  // We need to get the association id from the account id
  const assoc = associationId ? { id: associationId } : null;

  if (!assoc) redirect(`/home/${account}`);

  // Feature gate (request-cached, already loaded by the layout)
  const features = await loadAssociationFeatures(account);

  if (!features.isEnabled('expense_tracker')) redirect(`/home/${account}`);

  // Load in parallel: categories, vendors, and initial expense list
  const [categoriesRes, vendorsRes, expensesRes] = await Promise.all([
    (client as any)
      .from('expense_categories')
      .select('id, name')
      .or(`association_id.is.null,association_id.eq.${assoc.id}`)
      .order('name'),
    (client as any)
      .from('vendors')
      .select('id, name')
      .eq('association_id', assoc.id)
      .order('name')
      .limit(200),
    (client as any)
      .from('expenses')
      .select(
        `
        id, title, amount, gst_amount, payor, payee_name, mode_of_payment,
        reference_number, invoice_number, date_of_payment, notes, recurring,
        attachment_url, created_at,
        category:expense_categories(id, name)
      `,
        { count: 'exact' },
      )
      .eq('association_id', assoc.id)
      .is('deleted_at', null)
      .order('date_of_payment', { ascending: false })
      .limit(50),
  ]);

  return (
    <>
      <TeamAccountLayoutPageHeader
        account={account}
        title={'Expense Tracker'}
        description={'Track and analyse association expenses.'}
      />
      <PageBody>
        <ExpensesPageClient
          associationId={assoc.id}
          accountSlug={account}
          initialExpenses={expensesRes.data ?? []}
          totalCount={expensesRes.count ?? 0}
          categories={categoriesRes.data ?? []}
          vendors={vendorsRes.data ?? []}
          defaultTab={sp.tab ?? 'list'}
        />
      </PageBody>
    </>
  );
}
