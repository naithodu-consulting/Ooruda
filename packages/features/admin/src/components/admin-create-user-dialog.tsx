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
import { useAsyncDialog } from '@kit/ui/hooks/use-async-dialog';
import { If } from '@kit/ui/if';
import { Input } from '@kit/ui/input';
import { toast } from '@kit/ui/sonner';

import { createUserAction } from '../lib/server/admin-server-actions';
import {
  CreateUserSchema,
  CreateUserSchemaType,
} from '../lib/server/schema/create-user.schema';

export function AdminCreateUserDialog(props: React.PropsWithChildren) {
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog();

  const form = useForm({
    resolver: zodResolver(CreateUserSchema),
    defaultValues: {
      fullName: '',
      phone: '',
    },
    mode: 'onChange',
  });

  const { execute, result } = useAction(createUserAction, {
    onExecute: () => setIsPending(true),
    onSuccess: () => {
      toast.success('User created successfully');
      form.reset();
      setIsPending(false);
      setOpen(false);
    },
    onSettled: () => setIsPending(false),
  });

  const error = result.serverError;

  return (
    <AlertDialog
      open={dialogProps.open}
      onOpenChange={dialogProps.onOpenChange}
    >
      <AlertDialogTrigger render={props.children as React.ReactElement} />

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Create New User</AlertDialogTitle>

          <AlertDialogDescription>
            Enter the user&apos;s name and phone number. They will be able to
            sign in via phone OTP.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Form {...form}>
          <form
            data-test={'admin-create-user-form'}
            className={'flex flex-col space-y-4'}
            onSubmit={form.handleSubmit((data: CreateUserSchemaType) =>
              execute(data),
            )}
          >
            <If condition={!!error}>
              <Alert variant={'destructive'}>
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </If>

            <FormField
              name={'fullName'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>

                  <FormControl>
                    <Input
                      required
                      type="text"
                      placeholder={'e.g. Rajesh Kumar'}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name={'phone'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>

                  <FormControl>
                    <Input
                      required
                      type="tel"
                      placeholder={'e.g. 919911000001'}
                      {...field}
                    />
                  </FormControl>

                  <FormDescription>
                    Enter with country code (e.g. 919911000001 or
                    +919911000001).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>

              <Button disabled={isPending} type={'submit'}>
                {isPending ? 'Creating...' : 'Create User'}
              </Button>
            </AlertDialogFooter>
          </form>
        </Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
