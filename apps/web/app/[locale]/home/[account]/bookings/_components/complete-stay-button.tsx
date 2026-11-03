'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { LogOut } from 'lucide-react';
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

import { completeStayAction } from '../_lib/server/bookings-actions';

export function CompleteStayButton(props: {
  accountId: string;
  propertyId: string;
  bookingId: string;
  guestName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const { execute, isPending } = useAction(completeStayAction, {
    onSuccess: () => {
      setOpen(false);
      toast.success('Checked out');
      router.refresh();
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? 'Could not check out.');
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button data-test={'villa-booking-checkout-open'} />}
      >
        <LogOut className="mr-1.5 h-4 w-4" />
        Check out
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Check out {props.guestName}?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to check out {props.guestName}?
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* Not AlertDialogFooter: its bg-muted band clashes with the dialog. */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel
            disabled={isPending}
            data-test={'villa-booking-checkout-cancel'}
          >
            Not yet
          </AlertDialogCancel>
          <Button
            disabled={isPending}
            data-test={'villa-booking-checkout-confirm'}
            onClick={() =>
              execute({
                accountId: props.accountId,
                propertyId: props.propertyId,
                bookingId: props.bookingId,
              })
            }
          >
            {isPending ? 'Checking out…' : 'Check out'}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
