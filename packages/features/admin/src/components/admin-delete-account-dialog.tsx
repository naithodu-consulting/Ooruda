'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useAction } from 'next-safe-action/hooks';
import { useForm } from 'react-hook-form';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@kit/ui/form';
import { If } from '@kit/ui/if';
import { Input } from '@kit/ui/input';

import { deleteAccountAction } from '../lib/server/admin-server-actions';
import { DeleteAccountSchema } from '../lib/server/schema/admin-actions.schema';

export function AdminDeleteAccountDialog(
  props: React.PropsWithChildren<{
    accountId: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }>,
) {
  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <If condition={props.children}>
        <AlertDialogTrigger render={props.children as React.ReactElement} />
      </If>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Account</AlertDialogTitle>

          <AlertDialogDescription>
            Are you sure you want to delete this account? All the data
            associated with this account will be permanently deleted. Any active
            subscriptions will be canceled.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <DeleteAccountForm
          key={String(props.open)}
          accountId={props.accountId}
          onSuccess={() => props.onOpenChange?.(false)}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteAccountForm(props: {
  accountId: string;
  onSuccess: () => void;
}) {
  const { execute, isPending, hasErrored } = useAction(deleteAccountAction, {
    onSuccess: props.onSuccess,
  });

  const form = useForm({
    resolver: zodResolver(DeleteAccountSchema),
    defaultValues: {
      accountId: props.accountId,
      confirmation: '',
    },
  });

  return (
    <Form {...form}>
      <form
        data-test={'admin-delete-account-form'}
        className={'flex flex-col space-y-8'}
        onSubmit={form.handleSubmit((data) => execute(data))}
      >
        <If condition={hasErrored}>
          <Alert variant={'destructive'}>
            <AlertTitle>Error</AlertTitle>

            <AlertDescription>
              There was an error deleting the account. Please check the server
              logs to see what went wrong.
            </AlertDescription>
          </Alert>
        </If>

        <FormField
          name={'confirmation'}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Type <b>CONFIRM</b> to confirm
              </FormLabel>

              <FormControl>
                <Input
                  pattern={'CONFIRM'}
                  required
                  placeholder={'Type CONFIRM to confirm'}
                  {...field}
                />
              </FormControl>

              <FormDescription>
                Are you sure you want to do this? This action cannot be undone.
              </FormDescription>

              <FormMessage />
            </FormItem>
          )}
        />

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>

          <Button disabled={isPending} type={'submit'} variant={'destructive'}>
            {isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </AlertDialogFooter>
      </form>
    </Form>
  );
}
