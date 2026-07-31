import Link from 'next/link';

import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  TrendingUp,
} from 'lucide-react';

import { MetricCard } from '@kit/ui/metric-card';

import { billOutstanding, displayBillStatus } from '~/lib/bill-status';
import { formatINR } from '~/lib/format-inr';

/**
 * Narrow bill shape the tiles need — see `BILL_AMOUNTS_SELECT`.
 *
 * `advance_applied` is required rather than optional on purpose. This component
 * previously received a row type that omitted it, so `displayBillStatus` saw
 * every advance-settled bill as unpaid (and overdue once past its due date),
 * and the Outstanding tile double-counted credit that had already been applied.
 */
export interface BillKpiRow {
  total_amount: number;
  paid_amount: number;
  advance_applied: number;
  status: string;
  due_date: string;
  period: string;
}

/**
 * Server component: the KPI row on the Billing landing page.
 *
 * Deliberately has no `'use client'`. The KPIs are derived here on the server
 * and only the rendered tiles cross the wire, so the bill set itself is never
 * serialised into the client payload. Each tile is a plain link into the
 * unit list, pre-filtered to the slice it represents.
 */
export function BillingOverview({
  bills,
  accountSlug,
  currentPeriod,
}: {
  bills: BillKpiRow[];
  accountSlug: string;
  currentPeriod: string;
}) {
  const unitsHref = `/home/${accountSlug}/billing/units`;

  const thisMonth = bills.filter((b) => b.period === currentPeriod);
  const thisMonthBilled = thisMonth.reduce((s, b) => s + b.total_amount, 0);
  // Settled, not just paid — advance credit applied to a bill is real
  // collection, and is what the unit list reports in its Outstanding column.
  const thisMonthCollected = thisMonth.reduce(
    (s, b) => s + Math.min(b.paid_amount + b.advance_applied, b.total_amount),
    0,
  );
  const thisMonthPct =
    thisMonthBilled > 0
      ? Math.round((thisMonthCollected / thisMonthBilled) * 100)
      : null;

  const outstanding = bills.reduce((s, b) => s + billOutstanding(b), 0);

  const overdue = bills.filter((b) => displayBillStatus(b) === 'Overdue');
  const overdueAmount = overdue.reduce((s, b) => s + billOutstanding(b), 0);

  const paid = bills.filter((b) => displayBillStatus(b) === 'Paid');
  const paidAmount = paid.reduce((s, b) => s + b.total_amount, 0);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile
        href={`${unitsHref}?duration=current_month`}
        tooltip="View this month's bills by unit"
        data-test="tile-this-month"
      >
        <MetricCard
          icon={TrendingUp}
          label="This Month Billed"
          value={formatINR(thisMonthBilled)}
          sublabel={
            thisMonthPct !== null ? `${thisMonthPct}% received` : undefined
          }
          variant="blue"
        />
      </Tile>

      <Tile
        href={`${unitsHref}?filter=outstanding`}
        tooltip="Show units with an outstanding balance"
        data-test="tile-outstanding"
      >
        <MetricCard
          icon={FileText}
          label="Outstanding"
          value={formatINR(outstanding)}
          sublabel={`${bills.length - paid.length} unpaid bills`}
          variant="amber"
        />
      </Tile>

      <Tile
        href={`${unitsHref}?filter=overdue`}
        tooltip="Show units with overdue bills"
        data-test="tile-overdue"
      >
        <MetricCard
          icon={AlertTriangle}
          label="Overdue"
          value={formatINR(overdueAmount)}
          sublabel={`${overdue.length} bill${overdue.length !== 1 ? 's' : ''}`}
          variant={overdue.length > 0 ? 'red' : 'green'}
        />
      </Tile>

      <Tile
        href={`${unitsHref}?filter=all_paid`}
        tooltip="Show fully paid units"
        data-test="tile-fully-paid"
      >
        <MetricCard
          icon={CheckCircle2}
          label="Fully Paid"
          value={formatINR(paidAmount)}
          sublabel={`${paid.length} of ${bills.length} bills`}
          variant="green"
        />
      </Tile>
    </div>
  );
}

function Tile(props: {
  children: React.ReactNode;
  href: string;
  tooltip: string;
  'data-test'?: string;
}) {
  return (
    <Link
      href={props.href}
      title={props.tooltip}
      data-test={props['data-test']}
      className="focus-visible:ring-ring block w-full rounded-2xl text-left transition-all duration-150 hover:scale-[1.02] hover:shadow-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.99]"
    >
      {props.children}
    </Link>
  );
}
