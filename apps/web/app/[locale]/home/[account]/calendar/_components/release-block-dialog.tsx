'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useAction } from 'next-safe-action/hooks';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@kit/ui/button';
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
import { toast } from '@kit/ui/sonner';

import { daysBetweenYmd, todayInBillingZone } from '~/lib/billing-dates';
import { formatDateReadable } from '~/lib/format-date';
import { lastNightOf } from '~/lib/villa-db/dates';
import { blockReasonLabel, formatNights } from '~/lib/villa/labels';

import {
  type ReleaseBlockInput,
  ReleaseBlockSchema,
} from '../_lib/schemas/blocks.schema';
import { releaseBlockAction } from '../_lib/server/blocks-actions';

export interface ReleasableBlock {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  notes: string | null;
  /** 'ical' blocks belong to a channel feed; the calendar never opens these. */
  source: 'manual' | 'ical';
  /** The channel's name ('Airbnb') for an 'ical' block. */
  channelName?: string | null;
}

/**
 * Opens some or all nights of a block for sale again. Nights of the block
 * outside the chosen range stay blocked.
 */
export function ReleaseBlockDialog(props: {
  accountId: string;
  propertyId: string;
  block: ReleasableBlock;
  onClose: () => void;
}) {
  const today = todayInBillingZone();
  const { block } = props;
  const blockLast = lastNightOf(block.endDate);
  const earliest = block.startDate < today ? today : block.startDate;
  const allPast = blockLast < today;

  const form = useForm<ReleaseBlockInput>({
    resolver: zodResolver(ReleaseBlockSchema),
    defaultValues: {
      accountId: props.accountId,
      propertyId: props.propertyId,
      blockId: block.id,
      firstNight: earliest,
      lastNight: blockLast,
    },
  });

  const [firstNight, lastNight] = useWatch({
    control: form.control,
    name: ['firstNight', 'lastNight'],
  });

  const nights =
    firstNight && lastNight && lastNight >= firstNight
      ? daysBetweenYmd(firstNight, lastNight) + 1
      : 0;

  const { execute, isPending } = useAction(releaseBlockAction, {
    onSuccess: () => {
      toast.success('Nights opened for booking');
      props.onClose();
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not unblock those nights.'),
  });

  return (
    <Dialog open onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <DialogContent className="max-w-lg" data-test={'villa-release-dialog'}>
        <DialogHeader>
          <DialogTitle>{blockReasonLabel(block.reason)}</DialogTitle>
          <DialogDescription>
            Blocked {formatDateReadable(block.startDate)} to{' '}
            {formatDateReadable(blockLast)} (last night).
            {block.notes ? ` ${block.notes}` : ''}
          </DialogDescription>
        </DialogHeader>

        {allPast ? (
          <p className="text-muted-foreground text-sm">
            These nights are in the past and can no longer be changed.
          </p>
        ) : (
          <Form {...form}>
            <form
              className="flex flex-col gap-4"
              onSubmit={form.handleSubmit((values) => execute(values))}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  name="firstNight"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unblock from</FormLabel>
                      <FormControl>
                        <DatePicker
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          min={earliest}
                          max={blockLast}
                          data-test={'villa-release-first-night'}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="lastNight"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Until (last night)</FormLabel>
                      <FormControl>
                        <DatePicker
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          min={firstNight || earliest}
                          max={blockLast}
                          data-test={'villa-release-last-night'}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormDescription>
                {nights
                  ? `${formatNights(nights)} will be open for booking again. Any other nights of this block stay blocked.`
                  : 'Pick the nights to open for booking.'}
              </FormDescription>

              {/* Not DialogFooter: its bg-muted band clashes with the dialog. */}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={props.onClose}
                  data-test={'villa-release-cancel'}
                >
                  Keep blocked
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  data-test={'villa-release-submit'}
                >
                  {isPending ? 'Unblocking…' : 'Unblock'}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
