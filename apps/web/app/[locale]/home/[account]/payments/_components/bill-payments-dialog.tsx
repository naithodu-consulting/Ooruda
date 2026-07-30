'use client';

import { useState } from 'react';

import { Eye } from 'lucide-react';

import { Button } from '@kit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

import { DownloadPdfButton } from '~/components/download-pdf-button';
import { formatTimestampDateDMY } from '~/lib/format-date';
import { formatINR } from '~/lib/format-inr';

export interface PaymentRow {
  id: string;
  amount: number;
  mode: string;
  reference_no: string | null;
  paid_by_role: string;
  paid_at: string;
  receipt_no: string | null;
}

export function BillPaymentsDialog(props: {
  billId: string;
  billNo: string;
  associationId: string;
  payments: PaymentRow[];
  hidePayerColumn?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (props.payments.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            title="View payment history for this bill"
          >
            <Eye className="h-4 w-4" />
            {props.payments.length}{' '}
            {props.payments.length === 1 ? 'payment' : 'payments'}
          </Button>
        }
      />

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Payments for {props.billNo}</DialogTitle>
          <DialogDescription>
            Every payment recorded against this bill.
          </DialogDescription>
        </DialogHeader>

        {props.payments.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No payments recorded yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Date</TableHead>
                <TableHead scope="col">Mode</TableHead>
                {!props.hidePayerColumn && (
                  <TableHead scope="col">Paid by</TableHead>
                )}
                <TableHead scope="col" className="text-right">
                  Amount
                </TableHead>
                <TableHead scope="col">Receipt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>
                    {formatTimestampDateDMY(payment.paid_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{payment.mode}</span>
                      {payment.reference_no ? (
                        <span className="text-muted-foreground font-mono text-xs">
                          {payment.reference_no}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  {!props.hidePayerColumn && (
                    <TableCell>{payment.paid_by_role}</TableCell>
                  )}
                  <TableCell className="text-right tabular-nums">
                    {formatINR(payment.amount)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span>{payment.receipt_no ?? '—'}</span>
                      {payment.receipt_no ? (
                        <DownloadPdfButton
                          href={`/api/billing/receipts/${payment.id}/pdf`}
                          label="Download receipt PDF"
                          dataTest={`download-receipt-${payment.id}`}
                          variant="ghost"
                          iconSize="icon-xs"
                        />
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
