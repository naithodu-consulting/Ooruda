import { CircleAlert } from 'lucide-react';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import pathsConfig from '~/config/paths.config';
import { VILLA_ROLES, requireRole } from '~/lib/rbac';
import { todayIst } from '~/lib/villa-db/dates';
import { monthRange, parseMonth, shiftMonth } from '~/lib/villa/calendar';
import { selectVillaProperty } from '~/lib/villa/properties';

import { MonthNav } from '../_components/month-nav';
import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { VillaSwitcher } from '../_components/villa-switcher';
import { ExpensesView } from './_components/expenses-view';

export const metadata = { title: 'Expenses' };

interface Props {
  params: Promise<{ account: string }>;
  searchParams: Promise<{ month?: string; property?: string }>;
}

export default async function VillaExpensesPage({
  params,
  searchParams,
}: Props) {
  const [{ account }, sp] = await Promise.all([params, searchParams]);
  const today = todayIst();
  const month = parseMonth(sp.month, today);

  const { role, accountId } = await requireRole(account, VILLA_ROLES, 'villa');
  const { properties, property } = await selectVillaProperty(
    accountId,
    sp.property,
  );

  const base = pathsConfig.app.accountVillaExpenses.replace(
    '[account]',
    account,
  );
  const hrefFor = (m: string) => {
    const q = new URLSearchParams({ month: m });
    if (property && properties.length > 1) q.set('property', property.id);
    return `${base}?${q.toString()}`;
  };

  if (!property) {
    return (
      <PageBody>
        <TeamAccountLayoutPageHeader
          account={account}
          title={<Trans i18nKey={'villa.nav.expenses'} />}
          description={<AppBreadcrumbs />}
        />
        <Alert data-test={'villa-expenses-no-property'}>
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>No villa set up yet</AlertTitle>
          <AlertDescription>
            Expenses are recorded per villa. Ooruda support sets up your villa.
          </AlertDescription>
        </Alert>
      </PageBody>
    );
  }

  const { from, to } = monthRange(month);
  const { data: expenses, error } = await getSupabaseServerClient()
    .from('villa_expenses')
    .select(
      'id, category, description, vendor, amount, gst_amount, mode, spent_on, invoice_no, notes',
    )
    .eq('account_id', accountId)
    .eq('property_id', property.id)
    .gte('spent_on', from)
    .lt('spent_on', to)
    .order('spent_on', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(`expenses load failed: ${error.message}`);

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey={'villa.nav.expenses'} />}
        description={<AppBreadcrumbs />}
      />

      <div className="flex max-w-5xl flex-col gap-4">
        <VillaSwitcher
          properties={properties.map((p) => ({ id: p.id, name: p.name }))}
          current={property.id}
        />
        <MonthNav
          month={month}
          prevHref={hrefFor(shiftMonth(month, -1))}
          nextHref={hrefFor(shiftMonth(month, 1))}
          data-test-prev="villa-expenses-prev"
          data-test-month="villa-expenses-month"
          data-test-next="villa-expenses-next"
        />

        <ExpensesView
          accountId={accountId}
          propertyId={property.id}
          isOwner={role === 'villa_owner'}
          defaultDate={month === today.slice(0, 7) ? today : `${month}-01`}
          expenses={(expenses ?? []).map((e) => ({
            id: e.id,
            category: e.category,
            description: e.description,
            vendor: e.vendor,
            amount: Number(e.amount),
            gstAmount: Number(e.gst_amount),
            mode: e.mode,
            spentOn: e.spent_on,
            invoiceNo: e.invoice_no,
            notes: e.notes,
          }))}
        />
      </div>
    </PageBody>
  );
}
