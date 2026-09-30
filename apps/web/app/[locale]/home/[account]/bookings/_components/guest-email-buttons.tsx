'use client';

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

import {
  reopenStayAction,
  sendGuestEmailAction,
} from '../_lib/server/bookings-actions';

interface Ref {
  accountId: string;
  propertyId: string;
  bookingId: string;
}

export function GuestEmailButton(
  props: Ref & { template: 'pre_arrival' | 'thank_you'; again: boolean },
) {
  const router = useRouter();
  const { execute, isPending } = useAction(sendGuestEmailAction, {
    onSuccess: () => {
      toast.success('Email sent');
      router.refresh();
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not send the email.'),
  });

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => execute({ ...props, template: props.template })}
      data-test={`villa-guest-email-${props.template}-send`}
    >
      <Send className="mr-1.5 h-3.5 w-3.5" />
      {isPending ? 'Sending…' : props.again ? 'Send again' : 'Send now'}
    </Button>
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
