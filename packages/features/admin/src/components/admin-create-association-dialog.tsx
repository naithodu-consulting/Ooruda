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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { toast } from '@kit/ui/sonner';

import { createAssociationAction } from '../lib/server/admin-server-actions';
import {
  CreateAssociationSchema,
  CreateAssociationSchemaType,
} from '../lib/server/schema/create-association.schema';

interface UserOption {
  id: string;
  name: string;
}

export function AdminCreateAssociationDialog(
  props: React.PropsWithChildren<{
    users: UserOption[];
  }>,
) {
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog();

  const form = useForm({
    resolver: zodResolver(CreateAssociationSchema),
    defaultValues: {
      name: '',
      ownerId: '',
    },
    mode: 'onChange',
  });

  const { execute, result } = useAction(createAssociationAction, {
    onExecute: () => setIsPending(true),
    onSuccess: () => {
      toast.success('Association created successfully');
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
          <AlertDialogTitle>Create New Association</AlertDialogTitle>

          <AlertDialogDescription>
            Create an association and assign an existing user as its Association
            Admin. You can add more members afterwards from the accounts list.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Form {...form}>
          <form
            data-test={'admin-create-association-form'}
            className={'flex flex-col space-y-4'}
            onSubmit={form.handleSubmit((data: CreateAssociationSchemaType) =>
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
              name={'name'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Association Name</FormLabel>

                  <FormControl>
                    <Input
                      required
                      type="text"
                      placeholder={'e.g. Green Meadows Association'}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name={'ownerId'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Association Admin (owner)</FormLabel>

                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a user">
                          {(value: string) =>
                            props.users.find((u) => u.id === value)?.name ??
                            'Select a user'
                          }
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>

                    <SelectContent>
                      {props.users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <FormDescription>
                    This user becomes the Association Admin.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>

              <Button disabled={isPending} type={'submit'}>
                {isPending ? 'Creating...' : 'Create Association'}
              </Button>
            </AlertDialogFooter>
          </form>
        </Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
