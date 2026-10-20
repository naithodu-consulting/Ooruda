'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useAction } from 'next-safe-action/hooks';
import { useForm, useWatch } from 'react-hook-form';

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
import { SearchableSelect } from '@kit/ui/searchable-select';
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
  ACCOUNT_PRODUCT_LABELS,
  ACCOUNT_PRODUCT_TYPES,
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
      productType: 'association' as CreateAssociationSchemaType['productType'],
    },
    mode: 'onChange',
  });

  const productType = useWatch({ control: form.control, name: 'productType' });
  const isVilla = productType === 'villa';

  const { execute, result } = useAction(createAssociationAction, {
    onExecute: () => setIsPending(true),
    onSuccess: () => {
      toast.success(
        isVilla
          ? 'Villa account created successfully'
          : 'Association created successfully',
      );
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
          <AlertDialogTitle>Create New Account</AlertDialogTitle>

          <AlertDialogDescription>
            Create an association or a villa account and assign an existing user
            as its owner. The account type cannot be changed later. You can add
            more members afterwards from the accounts list.
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
              name={'productType'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account type</FormLabel>

                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger
                        className="w-full"
                        data-test={'admin-account-product-select'}
                      >
                        <SelectValue>
                          {(value: string) =>
                            ACCOUNT_PRODUCT_LABELS[
                              value as keyof typeof ACCOUNT_PRODUCT_LABELS
                            ] ?? 'Select a type'
                          }
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>

                    <SelectContent>
                      {ACCOUNT_PRODUCT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {ACCOUNT_PRODUCT_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <FormDescription>
                    Cannot be changed after the account is created.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name={'name'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {isVilla ? 'Villa name' : 'Association Name'}
                  </FormLabel>

                  <FormControl>
                    <Input
                      required
                      type="text"
                      placeholder={
                        isVilla
                          ? 'e.g. Villa 19'
                          : 'e.g. Green Meadows Association'
                      }
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
                  <FormLabel>
                    {isVilla ? 'Villa Admin' : 'Association Admin (owner)'}
                  </FormLabel>

                  <FormControl>
                    <SearchableSelect
                      className="w-full"
                      data-test={'admin-association-owner-select'}
                      items={props.users.map((user) => ({
                        value: user.id,
                        label: user.name,
                      }))}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      placeholder="Select a user"
                      searchPlaceholder="Search users…"
                      emptyMessage="No users found"
                    />
                  </FormControl>

                  <FormDescription>
                    {isVilla
                      ? 'This user becomes the Villa Admin.'
                      : 'This user becomes the Association Admin.'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>

              <Button disabled={isPending} type={'submit'}>
                {isPending
                  ? 'Creating...'
                  : isVilla
                    ? 'Create Villa Account'
                    : 'Create Association'}
              </Button>
            </AlertDialogFooter>
          </form>
        </Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
