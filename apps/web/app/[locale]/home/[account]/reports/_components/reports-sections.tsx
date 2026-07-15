import { Badge } from '@kit/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

import { billStatusBadgeClassName, displayBillStatus } from '~/lib/bill-status';
import { formatDateDMY } from '~/lib/format-date';
import { formatINR } from '~/lib/format-inr';
import { formatPeriod } from '~/lib/format-period';

export interface CollectionSummaryRow {
  period: string;
  billed: number;
  collected: number;
  billCount: number;
}

export interface OutstandingDueRow {
  id: string;
  period: string;
  bill_no: string;
  unit_no: string;
  total_amount: number;
  paid_amount: number;
  status: string;
  due_date: string;
}

export interface ElectricityUsageRow {
  id: string;
  period: string;
  invoice_amount: number;
  block_consumption_units: number;
  rate: number | null;
}

export function CollectionSummaryCard(props: { rows: CollectionSummaryRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Collection summary</CardTitle>
        <CardDescription>
          Billed vs. collected, by billing period.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {props.rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No bills generated yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Bills</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.rows.map((row) => (
                  <TableRow key={formatPeriod(row.period)}>
                    <TableCell className="font-medium">
                      {formatPeriod(row.period)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.billCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(row.billed)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(row.collected)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(row.billed - row.collected)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function OutstandingDuesCard(props: { rows: OutstandingDueRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Outstanding dues</CardTitle>
        <CardDescription>
          Every unpaid, partially paid, or overdue bill, soonest due date first.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {props.rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing outstanding right now.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Bill No.</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.rows.map((bill) => {
                  const status = displayBillStatus(bill);

                  return (
                    <TableRow key={bill.id}>
                      <TableCell>{bill.unit_no}</TableCell>
                      <TableCell>{bill.bill_no}</TableCell>
                      <TableCell>{formatPeriod(bill.period)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(bill.total_amount - bill.paid_amount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={billStatusBadgeClassName(status)}
                        >
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDateDMY(bill.due_date)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ElectricityUsageCard(props: { rows: ElectricityUsageRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Electricity usage</CardTitle>
        <CardDescription>
          Electricity invoice amount and block consumption, by period.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {props.rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No Electricity bills uploaded yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Invoice amount</TableHead>
                  <TableHead className="text-right">Block units</TableHead>
                  <TableHead className="text-right">Rate / unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {formatPeriod(row.period)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(row.invoice_amount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.block_consumption_units}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.rate !== null ? formatINR(row.rate) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MyDuesCard(props: { bills: OutstandingDueRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your dues</CardTitle>
        <CardDescription>
          Every bill raised against your unit(s), most recent period first.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {props.bills.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            You don't have any bills yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Bill No.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.bills.map((bill) => {
                  const status = displayBillStatus(bill);

                  return (
                    <TableRow key={bill.id}>
                      <TableCell className="font-medium">
                        {formatPeriod(bill.period)}
                      </TableCell>
                      <TableCell>{bill.unit_no}</TableCell>
                      <TableCell>{bill.bill_no}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(bill.total_amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(bill.paid_amount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={billStatusBadgeClassName(status)}
                        >
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDateDMY(bill.due_date)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
