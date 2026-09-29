'use client';

import { useAction } from 'next-safe-action/hooks';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@kit/ui/alert-dialog';
import { Button } from '@kit/ui/button';
import { useAsyncDialog } from '@kit/ui/hooks/use-async-dialog';
import { toast } from '@kit/ui/sonner';

import { disconnectVillaSiteAction } from '../lib/server/admin-server-actions';

/** Super-admin: unlink a villa property from its booking site. */
export function AdminDisconnectVillaSiteButton(props: {
  accountId: string;
  propertyId: string;
  propertyName: string;
}) {
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog();

  const { execute } = useAction(disconnectVillaSiteAction, {
    onExecute: () => setIsPending(true),
    onSuccess: () => {
      toast.success('Booking site disconnected');
      setOpen(false);
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not disconnect.'),
    onSettled: () => setIsPending(false),
  });

  return (
    <AlertDialog
      open={dialogProps.open}
      onOpenChange={dialogProps.onOpenChange}
    >
      <AlertDialogTrigger
        render={
          <Button
            size={'sm'}
            variant={'outline'}
            data-test={'admin-disconnect-villa-site-button'}
          />
        }
      >
        Disconnect
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect {props.propertyName}?</AlertDialogTitle>
          <AlertDialogDescription>
            The villa&apos;s calendar, bookings and rates stop working until it
            is connected again, and its stored key is deleted. Nothing on the
            booking site itself changes.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <Button
            variant={'destructive'}
            disabled={isPending}
            data-test={'admin-disconnect-villa-site-confirm'}
            onClick={() =>
              execute({
                accountId: props.accountId,
                propertyId: props.propertyId,
              })
            }
          >
            {isPending ? 'Disconnecting…' : 'Disconnect'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
