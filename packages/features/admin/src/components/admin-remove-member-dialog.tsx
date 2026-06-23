'use client';

import { useRouter } from 'next/navigation';

import { useAction } from 'next-safe-action/hooks';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@kit/ui/alert-dialog';
import { Button } from '@kit/ui/button';
import { toast } from '@kit/ui/sonner';

import { removeUserRoleAction } from '../lib/server/admin-server-actions';

export function AdminRemoveMemberDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  associationId: string;
}) {
  const router = useRouter();

  const { execute, isPending } = useAction(removeUserRoleAction, {
    onSuccess: () => {
      toast.success('Member removed successfully');
      router.refresh();
      props.onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.error?.serverError ?? 'Failed to remove member');
    },
  });

  const onConfirm = () => {
    execute({
      userId: props.userId,
      associationId: props.associationId,
    });
  };

  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Member</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove <b>{props.userName}</b> from this
            team account? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? 'Removing...' : 'Remove Member'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
