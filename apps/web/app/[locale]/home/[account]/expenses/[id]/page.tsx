import Link from 'next/link';
import { redirect } from 'next/navigation';

import { format } from 'date-fns';
import { ArrowLeft, Paperclip } from 'lucide-react';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { PageBody } from '@kit/ui/page';

import { formatINR } from '~/lib/format-inr';
import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../../_components/team-account-layout-page-header';

interface Props {
  params: Promise<{ account: string; id: string }>;
}

export const metadata = { title: 'Expense Detail' };

export default async function ExpenseDetailPage({ params }: Props) {
  const { account, id } = await params;

  const { associationId } = await requireRole(account, [
    'assoc_admin',
    'billing_operator',
  ]);

  const client = getSupabaseServerClient();

  const assoc = associationId ? { id: associationId } : null;

  if (!assoc) redirect(`/home/${account}`);

  const { data: expense, error } = await (client as any)
    .from('expenses')
    .select(
      `
      id, title, amount, gst_amount, payor, payee_name, mode_of_payment,
      reference_number, invoice_number, date_of_payment, notes, recurring,
      recurring_frequency, attachment_url, created_at,
      category:expense_categories(id, name),
      vendor:vendors(id, name, contact_person, phone, email)
    `,
    )
    .eq('id', id)
    .eq('association_id', assoc.id)
    .is('deleted_at', null)
    .single();

  if (error || !expense) redirect(`/home/${account}/expenses`);

  function labelVal(label: string, value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    return (
      <div className={'flex flex-col gap-0.5'}>
        <span className={'text-muted-foreground text-xs'}>{label}</span>
        <span className={'text-sm'}>{String(value)}</span>
      </div>
    );
  }

  const formattedDate = format(
    new Date(expense.date_of_payment + 'T00:00:00'),
    'd MMM yyyy',
  );

  return (
    <>
      <TeamAccountLayoutPageHeader
        account={account}
        title={'Expense Detail'}
        description={expense.title}
      />
      <PageBody>
        <div className={'flex max-w-2xl flex-col gap-y-6'}>
          <div>
            <Button
              variant={'ghost'}
              size={'sm'}
              render={<Link href={`/home/${account}/expenses`} />}
            >
              <ArrowLeft className={'mr-1.5 h-4 w-4'} />
              Back to Expenses
            </Button>
          </div>

          <Card>
            <CardHeader className={'pb-2'}>
              <div className={'flex items-start justify-between gap-2'}>
                <CardTitle className={'text-base'}>{expense.title}</CardTitle>
                {expense.category && (
                  <Badge variant={'secondary'} className={'text-xs'}>
                    {expense.category.name}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className={'grid grid-cols-2 gap-4 sm:grid-cols-3'}>
                {labelVal('Date of Payment', formattedDate)}
                {labelVal('Amount', formatINR(expense.amount))}
                {expense.gst_amount
                  ? labelVal('GST Amount', formatINR(expense.gst_amount))
                  : null}
                {labelVal('Mode of Payment', expense.mode_of_payment)}
                {labelVal('Payor', expense.payor)}
                {labelVal('Payee / Vendor', expense.payee_name)}
                {!!expense.reference_number &&
                  labelVal('Reference No.', expense.reference_number)}
                {!!expense.invoice_number &&
                  labelVal('Invoice No.', expense.invoice_number)}
                {expense.recurring &&
                  labelVal('Recurring', expense.recurring_frequency ?? 'Yes')}
                {!!expense.notes && labelVal('Notes', expense.notes)}
              </div>

              {expense.vendor && (
                <div className={'mt-4 border-t pt-4'}>
                  <p
                    className={
                      'text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase'
                    }
                  >
                    Vendor Details
                  </p>
                  <div className={'grid grid-cols-2 gap-4 sm:grid-cols-3'}>
                    {labelVal('Name', expense.vendor.name)}
                    {!!expense.vendor.contact_person &&
                      labelVal('Contact Person', expense.vendor.contact_person)}
                    {!!expense.vendor.phone &&
                      labelVal('Phone', expense.vendor.phone)}
                    {!!expense.vendor.email &&
                      labelVal('Email', expense.vendor.email)}
                  </div>
                </div>
              )}

              {expense.attachment_url && (
                <div className={'mt-4'}>
                  <a
                    href={expense.attachment_url}
                    target={'_blank'}
                    rel={'noreferrer'}
                    className={
                      'text-brand-ink inline-flex items-center gap-1.5 text-sm underline underline-offset-4'
                    }
                    data-test={'attachment-link'}
                  >
                    <Paperclip className={'h-3.5 w-3.5'} />
                    View Attachment
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
