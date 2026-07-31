'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@kit/ui/form';
import { Input } from '@kit/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { toast } from '@kit/ui/sonner';
import { Spinner } from '@kit/ui/spinner';

import { formatINR } from '~/lib/format-inr';

import { recordPaymentAction } from '../_lib/payments-actions';
import { PAYMENT_MODES, RecordPaymentSchema } from '../_lib/payments-schema';

const REFERENCE_PLACEHOLDERS: Record<string, string> = {
  UPI: 'UPI transaction ID',
  NEFT: 'UTR number',
  NetBanking: 'UTR / transaction reference',
  Card: 'Transaction ID',
  Wallet: 'Transaction ID',
  Cash: 'Voucher / receipt number',
};

export function RecordPaymentDialog(props: {
  billId: string;
  billNo: string;
  associationId: string;
  outstanding: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            data-test={`record-payment-${props.billId}`}
          >
            Record Payment
          </Button>
        }
      />

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a payment for {props.billNo}</DialogTitle>
          <DialogDescription>
            Outstanding balance: {formatINR(props.outstanding)}.
          </DialogDescription>
        </DialogHeader>

        <RecordPaymentForm
          billId={props.billId}
          associationId={props.associationId}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function RecordPaymentForm(props: {
  billId: string;
  associationId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm({
    resolver: zodResolver(RecordPaymentSchema),
    defaultValues: {
      amount: '',
      mode: 'Cash' as const,
      paid_by_role: 'Owner' as const,
      reference_no: '',
    },
  });

  const selectedMode = form.watch('mode');

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await recordPaymentAction(
        props.billId,
        props.associationId,
        values,
      );

      if (!result.success) {
        toast.error(result.error ?? 'Could not record the payment.');
        return;
      }

      toast.success('Payment recorded.');
      props.onDone();
      router.refresh();
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" min="0" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          name="mode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Payment Method</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {PAYMENT_MODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {selectedMode !== 'Razorpay' && (
          <FormField
            name="reference_no"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Transaction Reference{' '}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder={
                      REFERENCE_PLACEHOLDERS[selectedMode] ?? 'Reference number'
                    }
                    maxLength={100}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          name="paid_by_role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Paid by</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Owner">Owner</SelectItem>
                  <SelectItem value="Tenant">Tenant</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          disabled={isPending}
          size="sm"
          className="self-start"
        >
          {isPending && <Spinner className="mr-2 h-4 w-4" />}
          Record
        </Button>
      </form>
    </Form>
  );
}
