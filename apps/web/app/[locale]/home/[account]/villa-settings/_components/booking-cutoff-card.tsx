'use client';

import { useState } from 'react';

import { CalendarOff, X } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';

import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { DatePicker } from '@kit/ui/date-picker';
import { toast } from '@kit/ui/sonner';

import { formatDateReadable } from '~/lib/format-date';
import { todayInBillingZone } from '~/lib/billing-dates';

import { saveBookingCutoffAction } from '../_lib/server/villa-settings-actions';

export function BookingCutoffCard(props: {
  accountId: string;
  propertyId: string;
  bookingCutoffDate: string | null;
  canEdit: boolean;
}) {
  const [value, setValue] = useState(props.bookingCutoffDate);
  const today = todayInBillingZone();

  const { execute, isPending } = useAction(saveBookingCutoffAction, {
    onSuccess: () => toast.success('Booking cutoff saved'),
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not save the cutoff date.'),
  });

  const dirty = value !== props.bookingCutoffDate;

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarOff className="text-muted-foreground h-4 w-4" />
          Booking cutoff date
        </CardTitle>
        <CardDescription>
          Prevent new bookings with a check-in after this date. Leave empty for
          no limit.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <DatePicker
              value={value ?? ''}
              onChange={(v) => setValue(v || null)}
              min={today}
              disabled={!props.canEdit || isPending}
              data-test={'villa-settings-booking-cutoff'}
            />
          </div>

          {value && props.canEdit ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setValue(null)}
              disabled={isPending}
              aria-label="Clear cutoff date"
              data-test={'villa-settings-booking-cutoff-clear'}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        {value ? (
          <p className="text-muted-foreground text-xs">
            Guests cannot book check-in beyond{' '}
            <strong className="text-foreground">
              {formatDateReadable(value)}
            </strong>
            .
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            No cutoff — bookings are open-ended.
          </p>
        )}

        {dirty && props.canEdit ? (
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={isPending}
              onClick={() =>
                execute({ accountId: props.accountId, propertyId: props.propertyId, cutoffDate: value })
              }
              data-test={'villa-settings-booking-cutoff-save'}
            >
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
