'use client';

import { useMemo } from 'react';

import { useRouter } from 'next/navigation';

import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  TrendingUp,
} from 'lucide-react';

import { MetricCard } from '@kit/ui/metric-card';

import { displayBillStatus } from '~/lib/bill-status';
import { formatINR } from '~/lib/format-inr';

import type { BillRow } from './bills-section';

export function BillingOverview(props: {
  bills: BillRow[];
  accountSlug: string;
}) {
  const router = useRouter();

  const currentPeriod = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const kpis = useMemo(() => {
    const thisMonth = props.bills.filter((b) => b.period === currentPeriod);
    const overdue = props.bills.filter(
      (b) => displayBillStatus(b) === 'Overdue',
    );
    const paid = props.bills.filter((b) => displayBillStatus(b) === 'Paid');
    return {
      thisMonthBilled: thisMonth.reduce((s, b) => s + b.total_amount, 0),
      thisMonthCollected: thisMonth.reduce((s, b) => s + b.paid_amount, 0),
      outstanding: props.bills.reduce(
        (s, b) => s + Math.max(0, b.total_amount - b.paid_amount),
        0,
      ),
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce(
        (s, b) => s + Math.max(0, b.total_amount - b.paid_amount),
        0,
      ),
      paidCount: paid.length,
      paidAmount: paid.reduce((s, b) => s + b.total_amount, 0),
      totalBills: props.bills.length,
    };
  }, [props.bills, currentPeriod]);

  const thisMonthPct =
    kpis.thisMonthBilled > 0
      ? Math.round((kpis.thisMonthCollected / kpis.thisMonthBilled) * 100)
      : null;

  function handleTileClick(
    tile: 'this-month' | 'outstanding' | 'overdue' | 'fully-paid',
  ) {
    if (tile === 'this-month') {
      router.push(`/home/${props.accountSlug}/billing?period=${currentPeriod}`);
    } else if (tile === 'outstanding') {
      router.push(`/home/${props.accountSlug}/billing?filter=outstanding`);
    } else if (tile === 'overdue') {
      router.push(`/home/${props.accountSlug}/billing?filter=overdue`);
    } else if (tile === 'fully-paid') {
      router.push(`/home/${props.accountSlug}/billing?filter=all_paid`);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <TileButton
        onClick={() => handleTileClick('this-month')}
        tooltip="View this month's bill breakdown"
        data-test="tile-this-month"
      >
        <MetricCard
          icon={TrendingUp}
          label="This Month Billed"
          value={formatINR(kpis.thisMonthBilled)}
          sublabel={
            thisMonthPct !== null ? `${thisMonthPct}% collected` : undefined
          }
          variant="blue"
        />
      </TileButton>

      <TileButton
        onClick={() => handleTileClick('outstanding')}
        tooltip="Show units with outstanding balances"
        data-test="tile-outstanding"
      >
        <MetricCard
          icon={FileText}
          label="Outstanding"
          value={formatINR(kpis.outstanding)}
          sublabel={`${kpis.totalBills - kpis.paidCount} unpaid bills`}
          variant="amber"
        />
      </TileButton>

      <TileButton
        onClick={() => handleTileClick('overdue')}
        tooltip="Show units with overdue bills"
        data-test="tile-overdue"
      >
        <MetricCard
          icon={AlertTriangle}
          label="Overdue"
          value={formatINR(kpis.overdueAmount)}
          sublabel={`${kpis.overdueCount} bill${kpis.overdueCount !== 1 ? 's' : ''}`}
          variant={kpis.overdueCount > 0 ? 'red' : 'green'}
        />
      </TileButton>

      <TileButton
        onClick={() => handleTileClick('fully-paid')}
        tooltip="Show fully paid units"
        data-test="tile-fully-paid"
      >
        <MetricCard
          icon={CheckCircle2}
          label="Fully Paid"
          value={formatINR(kpis.paidAmount)}
          sublabel={`${kpis.paidCount} of ${kpis.totalBills} bills`}
          variant="green"
        />
      </TileButton>
    </div>
  );
}

function TileButton(props: {
  children: React.ReactNode;
  onClick: () => void;
  tooltip: string;
  'data-test'?: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.tooltip}
      data-test={props['data-test']}
      className="focus-visible:ring-ring block w-full cursor-pointer rounded-2xl text-left transition-all duration-150 hover:scale-[1.02] hover:shadow-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.99]"
    >
      {props.children}
    </button>
  );
}
