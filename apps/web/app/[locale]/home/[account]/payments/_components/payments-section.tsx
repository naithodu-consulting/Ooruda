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
import { cn } from '@kit/ui/utils';

import { billStatusBadgeClassName, displayBillStatus } from '~/lib/bill-status';
import { formatINR } from '~/lib/format-inr';
import { formatPeriod } from '~/lib/format-period';

import { BillPaymentsDialog, type PaymentRow } from './bill-payments-dialog';
import { RecordPaymentDialog } from './record-payment-dialog';

export interface BillPaymentRow {
  id: string;
  period: string;
  bill_no: string;
  unit_no: string;
  total_amount: number;
  paid_amount: number;
  status: string;
  due_date: string;
  payments: PaymentRow[];
}

export function PaymentsSection(props: {
  associationId: string;
  bills: BillPaymentRow[];
  canManage: boolean;
  canVoid: boolean;
  title?: string;
  description?: string;
}) {
  return (
    <Card className="border-0 shadow-none">
      <CardHeader>
        <CardTitle>{props.title ?? 'Payments'}</CardTitle>
        <CardDescription>
          {props.description ??
            'Record payments against bills and track receipts.'}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {props.bills.length === 0 ? (
          <p className="text-muted-foreground text-sm">No bills to show yet.</p>
        ) : (
          <div className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Bill No.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[1%]" />
                  <TableHead className="w-[1%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.bills.map((bill) => {
                  const status = displayBillStatus(bill);
                  const outstanding = bill.total_amount - bill.paid_amount;

                  return (
                    <TableRow key={bill.id}>
                      <TableCell className="font-medium text-muted-foreground">
                        {formatPeriod(bill.period)}
                      </TableCell>
                      <TableCell className="font-semibold">{bill.unit_no}</TableCell>
                      <TableCell className="text-muted-foreground">{bill.bill_no}</TableCell>
                      <TableCell className="text-right tabular-nums font-bold">
                        {formatINR(bill.total_amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {outstanding > 0 ? (
                          <span className="text-red-600">{formatINR(outstanding)}</span>
                        ) : (
                          <span className="text-green-600">0</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(billStatusBadgeClassName(status), "border-0 shadow-none font-bold bg-transparent px-0")}
                        >
                          <span className={cn("h-2 w-2 rounded-full mr-2 inline-block", 
                            status === 'Paid' ? 'bg-green-500' : 
                            status === 'Overdue' ? 'bg-red-500' : 
                            status === 'Partial' ? 'bg-orange-500' : 'bg-yellow-500'
                          )}></span>
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell className="w-[1%] whitespace-nowrap text-right">
                        <BillPaymentsDialog
                          billId={bill.id}
                          billNo={bill.bill_no}
                          associationId={props.associationId}
                          payments={bill.payments}
                          canVoid={props.canVoid}
                        />
                      </TableCell>

                      <TableCell className="w-[1%] whitespace-nowrap text-right">
                        {props.canManage && outstanding > 0 ? (
                          <RecordPaymentDialog
                            billId={bill.id}
                            billNo={bill.bill_no}
                            associationId={props.associationId}
                            outstanding={outstanding}
                          />
                        ) : null}
                      </TableCell>
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
