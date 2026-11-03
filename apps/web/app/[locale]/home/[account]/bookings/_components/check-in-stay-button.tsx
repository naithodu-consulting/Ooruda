'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { LogIn } from 'lucide-react';
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

import { checkInStayAction } from '../_lib/server/bookings-actions';

export function CheckInStayButton(props: {
  accountId: string;
  propertyId: string;
  bookingId: string;
  guestName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const { execute, isPending } = useAction(checkInStayAction, {
    onSuccess: () => {
      setOpen(false);
      toast.success('Checked in successfully');
      router.refresh();
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? 'Could not check in.');
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button data-test={'villa-booking-checkin-open'} />}
      >
        <LogIn className="mr-1.5 h-4 w-4" />
        Check in
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Check in {props.guestName}?</AlertDialogTitle>
          <AlertDialogDescription>
            Confirm that {props.guestName} has arrived at the villa and is
            checking in.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel
            disabled={isPending}
            data-test={'villa-booking-checkin-cancel'}
          >
            Cancel
          </AlertDialogCancel>
          <Button
            disabled={isPending}
            data-test={'villa-booking-checkin-confirm'}
            onClick={() =>
              execute({
                accountId: props.accountId,
                propertyId: props.propertyId,
                bookingId: props.bookingId,
              })
            }
          >
            {isPending ? 'Checking in…' : 'Check in'}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
