import { Banknote, IndianRupee, Receipt, Wallet } from 'lucide-react';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { MetricCard } from '@kit/ui/metric-card';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { formatINR } from '~/lib/format-inr';
import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import {
  type BillPaymentRow,
  PaymentsSection,
} from './_components/payments-section';

interface Props {
  params: Promise<{ account: string }>;
}

export const metadata = { title: 'Payments' };

type RawPayment = {
  id: string;
  amount: number;
  mode: string;
  paid_by_role: string;
  paid_at: string;
  receipts: { receipt_no: string } | { receipt_no: string }[] | null;
};

function receiptNoOf(payment: RawPayment): string | null {
  if (Array.isArray(payment.receipts)) {
    return payment.receipts[0]?.receipt_no ?? null;
  }

  return payment.receipts?.receipt_no ?? null;
}

function toBillPaymentRow(b: {
  id: string;
  period: string;
  bill_no: string;
  total_amount: number;
  paid_amount: number;
  status: string;
  due_date: string;
  unit_no: string;
  payments: RawPayment[] | null;
}): BillPaymentRow {
  return {
    id: b.id,
    period: b.period,
    bill_no: b.bill_no,
    unit_no: b.unit_no,
    total_amount: b.total_amount,
    paid_amount: b.paid_amount,
    status: b.status,
    due_date: b.due_date,
    payments: (b.payments ?? []).map((p) => ({
      id: p.id,
      amount: p.amount,
      mode: p.mode,
      paid_by_role: p.paid_by_role,
      paid_at: p.paid_at,
      receipt_no: receiptNoOf(p),
    })),
  };
}

const BILL_WITH_PAYMENTS_SELECT =
  'id, period, bill_no, total_amount, paid_amount, status, due_date, units(unit_no), payments(id, amount, mode, paid_by_role, paid_at, receipts(receipt_no))';

export default async function PaymentsPage({ params }: Props) {
  const { account } = await params;
  const { accountId, role, userId } = await requireRole(account, [
    'assoc_admin',
    'billing_operator',
    'prop_owner',
    'tenant',
  ]);

  const client = getSupabaseServerClient();

  const { data: association } = await client
    .from('associations')
    .select('id')
    .eq('account_id', accountId)
    .single();

  if (!association) {
    throw new Error('Unable to load the association for this account.');
  }

  if (role === 'prop_owner' || role === 'tenant') {
    const unitIds: string[] = [];

    if (role === 'prop_owner') {
      const { data: units } = await client
        .from('units')
        .select('id')
        .eq('association_id', association.id)
        .eq('owner_id', userId);

      unitIds.push(...(units ?? []).map((u) => u.id));
    } else {
      const { data: tenancies } = await client
        .from('tenancies')
        .select('unit_id')
        .eq('tenant_id', userId)
        .eq('status', 'active');

      unitIds.push(...(tenancies ?? []).map((t) => t.unit_id));
    }

    const { data: bills } =
      unitIds.length > 0
        ? await client
            .from('bills')
            .select(BILL_WITH_PAYMENTS_SELECT)
            .in('unit_id', unitIds)
            .order('period', { ascending: false })
        : { data: [] };

    const rows: BillPaymentRow[] = (bills ?? []).map((b) =>
      toBillPaymentRow({
        ...b,
        unit_no:
          (b.units as unknown as { unit_no: string } | null)?.unit_no ?? '—',
      }),
    );

    return (
      <PageBody>
        <TeamAccountLayoutPageHeader
          account={account}
          title={<Trans i18nKey="association.nav.payments" />}
          description={
            rows.length === 0
              ? 'No bills yet'
              : `${rows.length} bills · ${formatINR(rows.reduce((sum, b) => sum + b.paid_amount, 0))} paid`
          }
        />

        <div className="flex flex-col gap-4">
          <PaymentsMetrics rows={rows} />

          <PaymentsSection
            associationId={association.id}
            bills={rows}
            canManage={false}
            canVoid={false}
            title="Your payments"
            description="Every payment recorded against your bill(s)."
          />
        </div>
      </PageBody>
    );
  }

  const { data: bills } = await client
    .from('bills')
    .select(BILL_WITH_PAYMENTS_SELECT)
    .eq('association_id', association.id)
    .order('period', { ascending: false });

  const rows: BillPaymentRow[] = (bills ?? []).map((b) =>
    toBillPaymentRow({
      ...b,
      unit_no:
        (b.units as unknown as { unit_no: string } | null)?.unit_no ?? '—',
    }),
  );

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.payments" />}
        description={
          rows.length === 0
            ? 'No bills yet'
            : `${rows.length} bills · ${formatINR(rows.reduce((sum, b) => sum + b.paid_amount, 0))} collected`
        }
      />

      <div className="flex flex-col gap-4">
        <PaymentsMetrics rows={rows} />

        <PaymentsSection
          associationId={association.id}
          bills={rows}
          canManage={role === 'assoc_admin' || role === 'billing_operator'}
          canVoid={role === 'assoc_admin'}
        />
      </div>
    </PageBody>
  );
}

function PaymentsMetrics(props: { rows: BillPaymentRow[] }) {
  if (props.rows.length === 0) {
    return null;
  }

  const totalBilled = props.rows.reduce((sum, b) => sum + b.total_amount, 0);
  const totalCollected = props.rows.reduce((sum, b) => sum + b.paid_amount, 0);
  const totalOutstanding = totalBilled - totalCollected;
  const paymentCount = props.rows.reduce(
    (sum, b) => sum + b.payments.length,
    0,
  );

  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
      <MetricCard
        icon={Wallet}
        label="Collected"
        value={formatINR(totalCollected)}
        sublabel={
          totalBilled === 0
            ? '0% of billed'
            : `${Math.round((totalCollected / totalBilled) * 100)}% of billed`
        }
        variant="green"
      />
      <MetricCard
        icon={IndianRupee}
        label="Outstanding"
        value={formatINR(totalOutstanding)}
        sublabel="Unpaid + partial"
        variant="amber"
      />
      <MetricCard
        icon={Receipt}
        label="Payments recorded"
        value={String(paymentCount)}
        sublabel="Across all bills"
        variant="blue"
      />
      <MetricCard
        icon={Banknote}
        label="Total billed"
        value={formatINR(totalBilled)}
        sublabel={`${props.rows.length} bills`}
        variant="teal"
      />
    </div>
  );
}
