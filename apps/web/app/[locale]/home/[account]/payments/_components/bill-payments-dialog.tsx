'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Eye } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@kit/ui/alert-dialog';
import { Button } from '@kit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import { toast } from '@kit/ui/sonner';
import { Spinner } from '@kit/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

import { formatTimestampDateDMY } from '~/lib/format-date';
import { formatINR } from '~/lib/format-inr';

import { voidPaymentAction } from '../_lib/payments-actions';

export interface PaymentRow {
  id: string;
  amount: number;
  mode: string;
  paid_by_role: string;
  paid_at: string;
  receipt_no: string | null;
}

export function BillPaymentsDialog(props: {
  billId: string;
  billNo: string;
  associationId: string;
  payments: PaymentRow[];
  canVoid: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (props.payments.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Eye className="h-4 w-4" />
            View payments ({props.payments.length})
          </Button>
        }
      />

      <DialogContent>
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
                <TableHead>Date</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Paid by</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Receipt</TableHead>
                {props.canVoid ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>
                    {formatTimestampDateDMY(payment.paid_at)}
                  </TableCell>
                  <TableCell>{payment.mode}</TableCell>
                  <TableCell>{payment.paid_by_role}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatINR(payment.amount)}
                  </TableCell>
                  <TableCell>{payment.receipt_no ?? '—'}</TableCell>
                  {props.canVoid ? (
                    <TableCell>
                      <VoidPaymentButton
                        paymentId={payment.id}
                        billId={props.billId}
                        associationId={props.associationId}
                        onVoidSuccess={() => setOpen(false)}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}

function VoidPaymentButton(props: {
  paymentId: string;
  billId: string;
  associationId: string;
  onVoidSuccess: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onVoid = () => {
    startTransition(async () => {
      const result = await voidPaymentAction(
        props.paymentId,
        props.billId,
        props.associationId,
      );

      if (!result.success) {
        toast.error(result.error ?? 'Could not delete the payment.');
        return;
      }

      toast.success('Payment deleted.');
      setOpen(false);
      props.onVoidSuccess();
      router.refresh();
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button size="sm" variant="destructive">
            Delete
          </Button>
        }
      />

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this payment?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes the payment and its receipt, and recalculates the
            bill's paid amount. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(event) => {
              event.preventDefault();
              onVoid();
            }}
          >
            {isPending && <Spinner className="mr-2 h-4 w-4" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
