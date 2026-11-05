'use client';

import { useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useAction } from 'next-safe-action/hooks';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@kit/ui/button';
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
import { toast } from '@kit/ui/sonner';
import { Textarea } from '@kit/ui/textarea';

import { formatINR } from '~/lib/format-inr';
import { balanceDue, recomputeMoney } from '~/lib/villa/booking-adjust';

import {
  type AdjustBookingMoneyInput,
  AdjustBookingMoneySchema,
} from '../_lib/schemas/bookings.schema';
import { adjustBookingMoneyAction } from '../_lib/server/bookings-actions';

/**
 * Adjusts what a booking comes to (edit booking Phase 2).
 *
 * GST and the total are shown live but never submitted: the server derives
 * both from the same function that priced the stay. The figures here are a
 * preview of that, not an input to it.
 */
export function AdjustAmountDialog(props: {
  accountId: string;
  propertyId: string;
  bookingId: string;
  bookingCode: string | null;
  siteUpdatedAt: string;
  nights: number;
  /** Money received net of refunds, in rupees. */
  receivedRupees: number;
  money: {
    baseRupees: number;
    extraGuestRupees: number;
    discountRupees: number;
  };
}) {
  const [open, setOpen] = useState(false);

  const defaults: AdjustBookingMoneyInput = {
    accountId: props.accountId,
    propertyId: props.propertyId,
    bookingId: props.bookingId,
    siteUpdatedAt: props.siteUpdatedAt,
    baseAmount: props.money.baseRupees,
    extraGuestAmount: props.money.extraGuestRupees,
    discountAmount: props.money.discountRupees,
    reason: '',
  };

  const form = useForm({
    resolver: zodResolver(AdjustBookingMoneySchema),
    defaultValues: defaults,
  });

  const [base, extra, discount] = useWatch({
    control: form.control,
    name: ['baseAmount', 'extraGuestAmount', 'discountAmount'],
  });

  // A blank or unparseable field is NOT zero. Reading it as zero showed a
  // confident ₹0 stay and a matching total - a figure the save really would
  // have produced - so the preview agreed with a mistake instead of catching
  // it. Now it shows nothing until all three fields are numbers.
  const paise = (value: unknown): number | null => {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? Math.round(value * 100) : null;
    }

    if (typeof value !== 'string' || value.trim() === '') return null;

    const parsed = Number(value);

    return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
  };

  const basePaise = paise(base);
  const extraPaise = paise(extra);
  const discountPaise = paise(discount);
  const complete =
    basePaise !== null && extraPaise !== null && discountPaise !== null;

  // Mirrors the server's arithmetic exactly - same `recomputeMoney`, same
  // `flat18` underneath - so the operator is never shown a total the save
  // would not produce.
  const preview = complete
    ? recomputeMoney(
        {
          basePaise: basePaise!,
          extraGuestPaise: extraPaise!,
          discountPaise: discountPaise!,
        },
        props.nights,
      )
    : null;

  const receivedPaise = Math.round(props.receivedRupees * 100);
  const due = preview ? balanceDue(preview, receivedPaise) : 0;
  const belowReceipts = preview !== null && preview.totalPaise < receivedPaise;
  const discountTooLarge =
    complete && discountPaise! > basePaise! + extraPaise!;

  const { execute, isPending } = useAction(adjustBookingMoneyAction, {
    onSuccess: ({ data }) => {
      if (data && !data.auditWritten) {
        toast.warning(
          'Amount adjusted, but the change could not be written to the booking history. Note the reason elsewhere.',
          { duration: 12_000 },
        );
      } else {
        toast.success(
          data?.changedFields
            ? 'Amount adjusted. The change is in the booking history.'
            : 'Nothing was different, so nothing changed.',
        );
      }

      setOpen(false);
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not adjust the amount.'),
  });

  function onOpenChange(next: boolean) {
    if (next) form.reset(defaults);
    setOpen(next);
  }

  const amountField = (
    name: 'baseAmount' | 'extraGuestAmount' | 'discountAmount',
    label: string,
    hint?: string,
  ) => (
    <FormField
      name={name}
      control={form.control}
      render={({ field }) => (
        <FormItem className="sm:col-span-4">
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              value={(field.value as number | string | undefined) ?? ''}
              inputMode="decimal"
              data-test={`villa-adjust-${name}`}
            />
          </FormControl>
          {hint ? <FormDescription>{hint}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <>
      <Button
        variant="outline"
        onClick={() => onOpenChange(true)}
        data-test={'villa-adjust-amount-open'}
      >
        Adjust amount
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-xl"
          data-test={'villa-adjust-amount-dialog'}
        >
          <DialogHeader>
            <DialogTitle>
              Adjust {props.bookingCode ?? 'this booking'}
            </DialogTitle>
            <DialogDescription>
              GST and the total are worked out from these figures, at the same
              rate the stay was priced with. Dates cannot be changed here.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              className="grid grid-cols-1 gap-4 sm:grid-cols-12"
              onSubmit={form.handleSubmit((values) => execute(values))}
            >
              {amountField('baseAmount', 'Stay charge (₹)')}
              {amountField('extraGuestAmount', 'Extra guests (₹)')}
              {amountField('discountAmount', 'Discount (₹)', 'Before GST')}

              <div
                className="bg-card rounded-lg border p-3 text-sm sm:col-span-12"
                data-test={'villa-adjust-preview'}
              >
                {preview ? (
                  <dl className="grid grid-cols-[1fr_auto] gap-y-1">
                    <dt className="text-muted-foreground">Taxable value</dt>
                    <dd className="text-right">
                      {formatINR((preview.totalPaise - preview.taxPaise) / 100)}
                    </dd>
                    <dt className="text-muted-foreground">GST</dt>
                    <dd className="text-right">
                      {formatINR(preview.taxPaise / 100)}
                    </dd>
                    <dt className="font-medium">Total</dt>
                    <dd className="text-right font-medium">
                      {formatINR(preview.totalPaise / 100)}
                    </dd>
                    <dt className="text-muted-foreground">Received</dt>
                    <dd className="text-right">
                      {formatINR(props.receivedRupees)}
                    </dd>
                    <dt className="font-medium">Balance due</dt>
                    <dd className="text-right font-medium">
                      {formatINR(due / 100)}
                    </dd>
                  </dl>
                ) : (
                  <p className="text-muted-foreground">
                    Fill in all three amounts to see the GST and the total.
                  </p>
                )}

                {discountTooLarge ? (
                  <p
                    className="text-destructive mt-2"
                    data-test={'villa-adjust-discount-too-large'}
                  >
                    The discount is more than the stay and extra guests
                    together.
                  </p>
                ) : null}

                {belowReceipts ? (
                  <p
                    className="text-destructive mt-2"
                    data-test={'villa-adjust-below-receipts'}
                  >
                    This is below the {formatINR(props.receivedRupees)} already
                    received. Record the refund first, then adjust the total.
                  </p>
                ) : null}
              </div>

              <FormField
                name="reason"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-12">
                    <FormLabel>Why is the amount changing?</FormLabel>
                    <FormControl
                      render={
                        <Textarea
                          {...field}
                          rows={2}
                          placeholder="e.g. Two extra guests agreed on arrival at ₹1,500 a night"
                          data-test={'villa-adjust-reason'}
                        />
                      }
                    />
                    <FormDescription>
                      Kept in the booking history with the figures that changed.
                      Not shown to the guest.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-col-reverse gap-2 sm:col-span-12 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isPending}
                  data-test={'villa-adjust-discard'}
                >
                  Discard
                </Button>
                <Button
                  type="submit"
                  disabled={
                    isPending || belowReceipts || discountTooLarge || !complete
                  }
                  data-test={'villa-adjust-save'}
                >
                  {isPending ? 'Saving…' : 'Save amount'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
