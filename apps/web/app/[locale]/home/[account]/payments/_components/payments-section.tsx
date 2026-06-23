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

import { billStatusBadgeVariant, displayBillStatus } from '~/lib/bill-status';
import { formatINR } from '~/lib/format-inr';

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
    <Card>
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
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Bill No.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.bills.map((bill) => {
                  const status = displayBillStatus(bill);
                  const outstanding = bill.total_amount - bill.paid_amount;

                  return (
                    <TableRow key={bill.id}>
                      <TableCell className="font-medium">
                        {bill.period}
                      </TableCell>
                      <TableCell>{bill.unit_no}</TableCell>
                      <TableCell>{bill.bill_no}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(bill.total_amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(outstanding)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={billStatusBadgeVariant(status)}>
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <BillPaymentsDialog
                            billId={bill.id}
                            billNo={bill.bill_no}
                            associationId={props.associationId}
                            payments={bill.payments}
                            canVoid={props.canVoid}
                          />

                          {props.canManage && outstanding > 0 ? (
                            <RecordPaymentDialog
                              billId={bill.id}
                              billNo={bill.bill_no}
                              associationId={props.associationId}
                              outstanding={outstanding}
                            />
                          ) : null}
                        </div>
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
