'use client';

import { useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useAction } from 'next-safe-action/hooks';
import { useForm } from 'react-hook-form';

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
import { toast } from '@kit/ui/sonner';
import { Textarea } from '@kit/ui/textarea';

import {
  type VoidEnrichmentInput,
  VoidEnrichmentSchema,
} from '../_lib/schemas/bookings.schema';
import { voidEnrichmentAction } from '../_lib/server/bookings-actions';

/**
 * Retires a channel stay that was filled in by mistake, money included.
 *
 * Distinct from cancelling, which leaves the payout receipt standing and is
 * only offered before the check-in date. This takes the money back out and is
 * available whenever the mistake is found - which is usually late, when the
 * payout fails to reconcile.
 */
export function VoidEnrichmentDialog(props: {
  accountId: string;
  propertyId: string;
  bookingId: string;
  bookingCode: string | null;
  channelName: string;
}) {
  const [open, setOpen] = useState(false);

  const form = useForm({
    resolver: zodResolver(VoidEnrichmentSchema),
    defaultValues: {
      accountId: props.accountId,
      propertyId: props.propertyId,
      bookingId: props.bookingId,
      reason: '',
    } satisfies VoidEnrichmentInput,
  });

  const { execute, isPending } = useAction(voidEnrichmentAction, {
    onSuccess: ({ data }) => {
      // Each outcome is reported, including the ones that did nothing: an
      // operator who believes the money came back out when it did not is
      // worse off than one who was told to go and look.
      if (data?.outcome.receipt === 'failed') {
        // The stay IS cancelled; the money is not back out. Said first and
        // plainly, because this is the one outcome that leaves the villa's
        // numbers wrong until someone acts.
        toast.warning(
          'Stay voided, but the payout receipt could NOT be voided — the money is still counted. Void it by hand in the booking’s Payments panel.',
          { duration: 15_000 },
        );
      } else if (
        data?.outcome.commission === 'ambiguous' ||
        data?.outcome.commission === 'unknown'
      ) {
        toast.warning(
          'Stay voided and the payout reversed, but the commission expense was not removed. Remove it in Expenses.',
          { duration: 12_000 },
        );
      } else if (data && !data.auditWritten) {
        toast.warning(
          'Stay voided, but the change could not be written to the booking history. Note the reason elsewhere.',
          { duration: 12_000 },
        );
      } else {
        toast.success('Stay voided. The payout is out of your numbers.');
      }

      setOpen(false);
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not void this stay.'),
  });

  function onOpenChange(next: boolean) {
    if (next) form.reset();
    setOpen(next);
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => onOpenChange(true)}
        className="border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
        data-test={'villa-void-enrichment-open'}
      >
        Void enrichment
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="sm:max-w-lg"
          data-test={'villa-void-enrichment-dialog'}
        >
          <DialogHeader>
            <DialogTitle>Void {props.bookingCode ?? 'this stay'}?</DialogTitle>
            <DialogDescription>
              For a stay filled in by mistake. The {props.channelName} payout
              receipt is voided, any commission expense is removed, and the
              nights go back on the calendar. The same {props.channelName}{' '}
              calendar entry can be filled in again afterwards.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              className="flex flex-col gap-4"
              onSubmit={form.handleSubmit((values) => execute(values))}
            >
              <FormField
                name="reason"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>What was wrong with it?</FormLabel>
                    <FormControl
                      render={
                        <Textarea
                          {...field}
                          rows={3}
                          placeholder="e.g. Filled in against the wrong calendar entry — guest and dates belong to a different booking"
                          data-test={'villa-void-enrichment-reason'}
                        />
                      }
                    />
                    <FormDescription>
                      Kept in the booking history. This undoes money already
                      recorded as received, so say enough for it to make sense
                      months later.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isPending}
                  data-test={'villa-void-enrichment-keep'}
                >
                  Keep stay
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={isPending}
                  data-test={'villa-void-enrichment-confirm'}
                >
                  {isPending ? 'Voiding…' : 'Void stay'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
