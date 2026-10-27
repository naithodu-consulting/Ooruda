'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { Send, Undo2 } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@kit/ui/alert-dialog';
import { Button } from '@kit/ui/button';
import { toast } from '@kit/ui/sonner';

import { formatDateReadable } from '~/lib/format-date';

import {
  reopenStayAction,
  sendGuestEmailAction,
} from '../_lib/server/bookings-actions';

interface Ref {
  accountId: string;
  propertyId: string;
  bookingId: string;
}

interface ConfirmationInfo {
  guestName: string;
  guestEmail: string;
  checkIn: string;
  checkOut: string;
}

export function GuestEmailButton(
  props: Ref & {
    template: 'booking_confirmation' | 'pre_arrival' | 'thank_you';
    again: boolean;
    disabled?: boolean;
    /** When provided, an AlertDialog confirms before sending. */
    confirmationInfo?: ConfirmationInfo;
  },
) {
  const { again, disabled, confirmationInfo, ...ref } = props;
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const { execute, isPending } = useAction(sendGuestEmailAction, {
    onSuccess: () => {
      toast.success('Email sent');
      setOpen(false);
      router.refresh();
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? 'Could not send the email.');
      setOpen(false);
    },
  });

  const label = isPending ? 'Sending…' : again ? 'Send again' : 'Send now';

  if (!confirmationInfo) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={isPending || disabled}
        title={disabled ? 'Sending by hand is switched off for now' : undefined}
        onClick={() => execute(ref)}
        data-test={`villa-guest-email-${props.template}-send`}
      >
        <Send className="mr-1.5 h-3.5 w-3.5" />
        {label}
      </Button>
    );
  }

  const { guestName, guestEmail, checkIn, checkOut } = confirmationInfo;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            disabled={isPending || disabled}
            title={
              disabled ? 'Sending by hand is switched off for now' : undefined
            }
            data-test={`villa-guest-email-${props.template}-send`}
          />
        }
      >
        <Send className="mr-1.5 h-3.5 w-3.5" />
        {label}
      </AlertDialogTrigger>

      <AlertDialogContent data-test={'villa-guest-email-confirm-dialog'}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {again ? 'Resend' : 'Send'} booking confirmation?
          </AlertDialogTitle>
          <AlertDialogDescription render={<div className="flex flex-col gap-2" />}>
              <dl className="bg-muted/40 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg px-4 py-3 text-sm">
                <dt className="text-muted-foreground">Guest</dt>
                <dd className="font-medium">{guestName}</dd>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="break-all">{guestEmail}</dd>
                <dt className="text-muted-foreground">Check-in</dt>
                <dd>{formatDateReadable(checkIn)}</dd>
                <dt className="text-muted-foreground">Check-out</dt>
                <dd>{formatDateReadable(checkOut)}</dd>
              </dl>
              {again ? (
                <p className="text-muted-foreground text-xs">
                  The guest will receive this email again. Only send if they
                  asked for it or the first one did not arrive.
                </p>
              ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel data-test={'villa-guest-email-confirm-cancel'}>
            Cancel
          </AlertDialogCancel>
          <Button
            disabled={isPending}
            onClick={() => execute(ref)}
            data-test={'villa-guest-email-confirm-send'}
          >
            <Send className="mr-1.5 h-3.5 w-3.5" />
            {isPending ? 'Sending…' : again ? 'Resend email' : 'Send email'}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function UndoCheckoutButton(props: Ref) {
  const router = useRouter();
  const { execute, isPending } = useAction(reopenStayAction, {
    onSuccess: () => {
      toast.success('Check-out undone');
      router.refresh();
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not undo the check-out.'),
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            data-test={'villa-booking-reopen-open'}
          />
        }
      >
        <Undo2 className="mr-1.5 h-3.5 w-3.5" />
        Undo check-out
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Undo the check-out?</AlertDialogTitle>
          <AlertDialogDescription>
            For a check-out pressed by mistake, or a guest who stayed on. The
            stay becomes confirmed again and the thank-you email waits for the
            next check-out.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* Not AlertDialogFooter: its bg-muted band clashes with the dialog. */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel data-test={'villa-booking-reopen-cancel'}>
            Keep checked out
          </AlertDialogCancel>
          <Button
            disabled={isPending}
            onClick={() => execute(props)}
            data-test={'villa-booking-reopen-confirm'}
          >
            {isPending ? 'Undoing…' : 'Undo check-out'}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
