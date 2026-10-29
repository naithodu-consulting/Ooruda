'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { Ban, IndianRupee, Plus, Undo2, Wallet } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { type Resolver, useForm, useWatch } from 'react-hook-form';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { DatePicker } from '@kit/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@kit/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
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
import { Textarea } from '@kit/ui/textarea';
import { cn } from '@kit/ui/utils';

import { RupeeInput } from '~/components/rupee-input';
import { todayInBillingZone } from '~/lib/billing-dates';
import { formatDateReadable } from '~/lib/format-date';
import { formatINR } from '~/lib/format-inr';
import { paymentModeLabel } from '~/lib/villa/labels';

import {
  PAYMENT_MODES,
  type RecordPaymentInput,
  RecordPaymentSchema,
  type RecordRefundInput,
  RecordRefundSchema,
  type VoidPaymentInput,
  VoidPaymentSchema,
} from '../_lib/schemas/payments.schema';
import {
  recordPaymentAction,
  recordRefundAction,
  voidPaymentAction,
} from '../_lib/server/payments-actions';

const modeLabel = paymentModeLabel;

const STATUS_LABELS: Record<string, string> = {
  unpaid: 'Unpaid',
  partially_paid: 'Part paid',
  paid: 'Paid in full',
  refunded: 'Refunded',
};

interface Receipt {
  id: string;
  receiptNo: string;
  mode: string;
  amount: number;
  paidOn: string;
  reference: string | null;
  payerName: string | null;
  voided: boolean;
  voidReason: string | null;
  refundable: number;
  refunds: {
    id: string;
    refundNo: string;
    amount: number;
    refundedOn: string;
    reason: string;
    mode: string;
  }[];
}

interface Ref {
  accountId: string;
  propertyId: string;
  bookingId: string;
}

export function PaymentsPanel(
  props: Ref & {
    bookingStatus: string;
    guestName: string;
    isOwner: boolean;
    summary: {
      total: number;
      received: number;
      refunded: number;
      due: number;
      excess: number;
      status: string;
    };
    online: {
      id: string;
      amount: number;
      status: string;
      date: string | null;
      reference: string | null;
    }[];
    receipts: Receipt[];
  },
) {
  const router = useRouter();
  const ref: Ref = {
    accountId: props.accountId,
    propertyId: props.propertyId,
    bookingId: props.bookingId,
  };
  const [dialog, setDialog] = useState<
    | { kind: 'record' }
    | { kind: 'refund'; receipt: Receipt }
    | { kind: 'void'; receipt: Receipt }
    | null
  >(null);
  const done = () => {
    setDialog(null);
    router.refresh();
  };
  const s = props.summary;
  const canRecord = ['confirmed', 'completed'].includes(props.bookingStatus);

  return (
    <Card className="bg-card lg:col-span-2" data-test={'villa-payments'}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="text-muted-foreground h-4 w-4" />
          Payments
        </CardTitle>
        <Badge
          variant="outline"
          className={cn(
            s.status === 'paid' && 'border-success/40 text-success',
          )}
          data-test={'villa-payments-status'}
        >
          {STATUS_LABELS[s.status] ?? s.status}
        </Badge>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Total', s.total, 'total'],
            ['Received', s.received, 'received'],
            ['Refunded', s.refunded, 'refunded'],
            [
              s.excess > 0 ? 'Additional Payment' : 'Balance due',
              s.excess > 0 ? s.excess : s.due,
              'due',
            ],
          ].map(([label, value, key]) => (
            <div
              key={key as string}
              className="rounded-lg border p-3"
              data-test={`villa-payments-${key as string}`}
            >
              <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {label}
              </dt>
              <dd className="text-lg font-bold tabular-nums">
                {formatINR(value as number)}
              </dd>
            </div>
          ))}
        </dl>

        {canRecord ? (
          <div>
            <Button
              onClick={() => setDialog({ kind: 'record' })}
              data-test={'villa-payment-record'}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Record a payment
            </Button>
          </div>
        ) : null}

        {props.online.length > 0 ? (
          <section className="flex flex-col gap-1.5">
            <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              On the website
            </h3>
            <ul className="divide-border divide-y rounded-lg border">
              {props.online.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm"
                  data-test={'villa-payment-online'}
                >
                  <span className="font-medium tabular-nums">
                    {formatINR(p.amount)}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    Razorpay
                    {p.date
                      ? ` · ${formatDateReadable(p.date.slice(0, 10))}`
                      : ''}
                  </span>
                  <Badge variant="outline" className="ml-auto">
                    {p.status === 'captured'
                      ? 'Received'
                      : p.status === 'refunded'
                        ? 'Refunded'
                        : 'Failed'}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {props.receipts.length > 0 ? (
          <section className="flex flex-col gap-1.5">
            <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Offline payments
            </h3>
            <ul className="divide-border divide-y rounded-lg border">
              {props.receipts.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-1.5 p-3 text-sm"
                  data-test={'villa-payment-receipt'}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span
                      className={cn(
                        'font-medium tabular-nums',
                        r.voided && 'text-muted-foreground line-through',
                      )}
                    >
                      {formatINR(r.amount)}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {modeLabel(r.mode)} · {formatDateReadable(r.paidOn)}
                      {r.reference ? ` · ${r.reference}` : ''}
                    </span>
                    {r.voided ? (
                      <Badge
                        variant="outline"
                        data-test={'villa-payment-void-badge'}
                      >
                        Void
                      </Badge>
                    ) : null}
                    {props.isOwner && !r.voided ? (
                      <span className="ml-auto flex gap-1">
                        {r.refundable > 0 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setDialog({ kind: 'refund', receipt: r })
                            }
                            data-test={'villa-payment-refund'}
                          >
                            <Undo2 className="mr-1 h-3.5 w-3.5" />
                            Refund
                          </Button>
                        ) : null}
                        {r.refunds.length === 0 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setDialog({ kind: 'void', receipt: r })
                            }
                            data-test={'villa-payment-void'}
                          >
                            <Ban className="mr-1 h-3.5 w-3.5" />
                            Void
                          </Button>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                  {r.voided && r.voidReason ? (
                    <p className="text-muted-foreground text-xs">
                      Void: {r.voidReason}
                    </p>
                  ) : null}
                  {r.refunds.map((f) => (
                    <p
                      key={f.id}
                      className="text-muted-foreground flex flex-wrap items-center gap-x-2 pl-3 text-xs"
                      data-test={'villa-payment-refund-row'}
                    >
                      <span>Refunded {formatINR(f.amount)}</span>
                      <span>
                        {modeLabel(f.mode)} · {formatDateReadable(f.refundedOn)}
                      </span>
                      <span className="break-words">{f.reason}</span>
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {props.online.length === 0 && props.receipts.length === 0 ? (
          <p
            className="text-muted-foreground text-sm"
            data-test={'villa-payments-empty'}
          >
            No payments yet.
          </p>
        ) : null}
      </CardContent>

      {dialog?.kind === 'record' ? (
        <RecordPaymentDialog
          {...ref}
          due={s.due}
          guestName={props.guestName}
          onClose={() => setDialog(null)}
          onDone={done}
        />
      ) : null}
      {dialog?.kind === 'refund' ? (
        <RefundDialog
          {...ref}
          receipt={dialog.receipt}
          onClose={() => setDialog(null)}
          onDone={done}
        />
      ) : null}
      {dialog?.kind === 'void' ? (
        <VoidDialog
          {...ref}
          receipt={dialog.receipt}
          onClose={() => setDialog(null)}
          onDone={done}
        />
      ) : null}
    </Card>
  );
}

function ModeField({
  control,
  name,
  test,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any;
  name: 'mode';
  test: string;
}) {
  return (
    <FormField
      name={name}
      control={control}
      render={({ field }) => (
        <FormItem>
          <FormLabel>Payment Mode</FormLabel>
          <Select value={field.value} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger className="w-full" data-test={test}>
                <SelectValue>{(v: string) => modeLabel(v)}</SelectValue>
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {PAYMENT_MODES.map((m) => (
                <SelectItem key={m} value={m} data-test={`${test}-${m}`}>
                  {modeLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function Actions(props: {
  onClose: () => void;
  pending: boolean;
  label: string;
  pendingLabel: string;
  test: string;
  destructive?: boolean;
}) {
  return (
    // Not DialogFooter: its bg-muted band clashes with the dialog.
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button
        type="button"
        variant="outline"
        onClick={props.onClose}
        data-test={`${props.test}-cancel`}
      >
        Cancel
      </Button>
      <Button
        type="submit"
        variant={props.destructive ? 'destructive' : 'default'}
        disabled={props.pending}
        data-test={`${props.test}-submit`}
      >
        {props.pending ? props.pendingLabel : props.label}
      </Button>
    </div>
  );
}

function RecordPaymentDialog(
  props: Ref & {
    due: number;
    guestName: string;
    onClose: () => void;
    onDone: () => void;
  },
) {
  const today = todayInBillingZone();
  const form = useForm<RecordPaymentInput>({
    resolver: zodResolver(RecordPaymentSchema) as Resolver<RecordPaymentInput>,
    defaultValues: {
      accountId: props.accountId,
      propertyId: props.propertyId,
      bookingId: props.bookingId,
      requestId: crypto.randomUUID(),
      mode: 'upi',
      amount: props.due > 0 ? String(props.due) : '',
      paidOn: today,
      reference: '',
      payerName: props.guestName,
      note: '',
    },
  });

  const amount = Number(useWatch({ control: form.control, name: 'amount' }));
  const over = props.due > 0 && amount > props.due ? amount - props.due : 0;

  const { execute, isPending } = useAction(recordPaymentAction, {
    onSuccess: () => {
      toast.success('Payment recorded');
      props.onDone();
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not record the payment.'),
  });

  return (
    <Dialog open onOpenChange={(o) => (!o ? props.onClose() : undefined)}>
      <DialogContent
        className="max-h-[92vh] max-w-lg overflow-y-auto"
        data-test={'villa-payment-dialog'}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IndianRupee className="h-4 w-4" />
            Record a payment
          </DialogTitle>
          <DialogDescription>Record the amount received.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((v) => execute(v))}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                name="amount"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <FormControl
                      render={
                        <RupeeInput
                          {...field}
                          value={
                            (field.value as string | number | undefined) ?? ''
                          }
                          data-test={'villa-payment-amount'}
                        />
                      }
                    />
                    {over > 0 ? (
                      <FormDescription
                        className="text-warning"
                        data-test={'villa-payment-over'}
                      >
                        {formatINR(over)} more than is due.
                      </FormDescription>
                    ) : props.due <= 0 ? (
                      <FormDescription>
                        Nothing is due on this stay.
                      </FormDescription>
                    ) : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                name="paidOn"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Received on</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        max={today}
                        data-test={'villa-payment-date'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <ModeField
                control={form.control}
                name="mode"
                test={'villa-payment-mode'}
              />
              <FormField
                name="reference"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference (optional)</FormLabel>
                    <FormControl
                      render={
                        <Input
                          {...field}
                          placeholder="UPI or bank reference"
                          data-test={'villa-payment-reference'}
                        />
                      }
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                name="payerName"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Paid By</FormLabel>
                    <FormControl
                      render={
                        <Input {...field} data-test={'villa-payment-payer'} />
                      }
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                name="note"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Note (optional)</FormLabel>
                    <FormControl
                      render={
                        <Textarea
                          {...field}
                          rows={2}
                          data-test={'villa-payment-note'}
                        />
                      }
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Actions
              onClose={props.onClose}
              pending={isPending}
              label="Save"
              pendingLabel="Saving…"
              test="villa-payment"
            />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function RefundDialog(
  props: Ref & { receipt: Receipt; onClose: () => void; onDone: () => void },
) {
  const today = todayInBillingZone();
  const form = useForm<RecordRefundInput>({
    resolver: zodResolver(RecordRefundSchema) as Resolver<RecordRefundInput>,
    defaultValues: {
      accountId: props.accountId,
      propertyId: props.propertyId,
      bookingId: props.bookingId,
      paymentId: props.receipt.id,
      requestId: crypto.randomUUID(),
      amount: String(props.receipt.refundable),
      mode: props.receipt.mode as RecordRefundInput['mode'],
      refundedOn: today,
      reference: '',
      reason: '',
    },
  });

  const { execute, isPending } = useAction(recordRefundAction, {
    onSuccess: () => {
      toast.success('Refund recorded');
      props.onDone();
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not record the refund.'),
  });

  return (
    <Dialog open onOpenChange={(o) => (!o ? props.onClose() : undefined)}>
      <DialogContent
        className="max-h-[92vh] max-w-lg overflow-y-auto"
        data-test={'villa-refund-dialog'}
      >
        <DialogHeader>
          <DialogTitle>Record a refund</DialogTitle>
          <DialogDescription>
            Record money already sent back to the guest. Up to{' '}
            {formatINR(props.receipt.refundable)} remaining.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((v) => execute(v))}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                name="amount"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount refunded</FormLabel>
                    <FormControl
                      render={
                        <RupeeInput
                          {...field}
                          value={
                            (field.value as string | number | undefined) ?? ''
                          }
                          data-test={'villa-refund-amount'}
                        />
                      }
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                name="refundedOn"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Refunded on</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        min={props.receipt.paidOn}
                        max={today}
                        data-test={'villa-refund-date'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <ModeField
                control={form.control}
                name="mode"
                test={'villa-refund-mode'}
              />
              <FormField
                name="reference"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference (optional)</FormLabel>
                    <FormControl
                      render={
                        <Input
                          {...field}
                          data-test={'villa-refund-reference'}
                        />
                      }
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                name="reason"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Why</FormLabel>
                    <FormControl
                      render={
                        <Textarea
                          {...field}
                          rows={2}
                          placeholder="e.g. Cancelled 20 days out: 50% under the policy"
                          data-test={'villa-refund-reason'}
                        />
                      }
                    />
                    <FormDescription>
                      Online (Razorpay) refunds from Ooruda come later; record
                      them here once sent.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Actions
              onClose={props.onClose}
              pending={isPending}
              label="Record refund"
              pendingLabel="Saving…"
              test="villa-refund"
            />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function VoidDialog(
  props: Ref & { receipt: Receipt; onClose: () => void; onDone: () => void },
) {
  const form = useForm<VoidPaymentInput>({
    resolver: zodResolver(VoidPaymentSchema),
    defaultValues: {
      accountId: props.accountId,
      propertyId: props.propertyId,
      bookingId: props.bookingId,
      paymentId: props.receipt.id,
      reason: '',
    },
  });

  const { execute, isPending } = useAction(voidPaymentAction, {
    onSuccess: () => {
      toast.success('Payment voided');
      props.onDone();
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not void the receipt.'),
  });

  return (
    <Dialog open onOpenChange={(o) => (!o ? props.onClose() : undefined)}>
      <DialogContent className="max-w-md" data-test={'villa-void-dialog'}>
        <DialogHeader>
          <DialogTitle>Void this payment?</DialogTitle>
          <DialogDescription>
            For a payment entered by mistake. It stays in the list, marked void.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((v) => execute(v))}
          >
            <FormField
              name="reason"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Why</FormLabel>
                  <FormControl
                    render={
                      <Input
                        {...field}
                        placeholder="e.g. Entered twice"
                        data-test={'villa-void-reason'}
                      />
                    }
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <Actions
              onClose={props.onClose}
              pending={isPending}
              label="Void payment"
              pendingLabel="Voiding…"
              test="villa-void"
              destructive
            />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
