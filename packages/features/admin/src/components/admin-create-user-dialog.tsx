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
import { PhoneInput } from '@kit/ui/phone-input';
import { SearchableSelect } from '@kit/ui/searchable-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { toast } from '@kit/ui/sonner';

import { createUserAction } from '../lib/server/admin-server-actions';
import {
  CreateUserSchema,
  CreateUserSchemaType,
  ROLE_LABELS,
  ROLES_BY_PRODUCT,
} from '../lib/server/schema/create-user.schema';

interface AssociationOption {
  id: string;
  name: string;
  productType?: 'association' | 'villa';
}

export function AdminCreateUserDialog(
  props: React.PropsWithChildren<{
    associations: AssociationOption[];
  }>,
) {
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog();

  const form = useForm({
    resolver: zodResolver(CreateUserSchema),
    defaultValues: {
      fullName: '',
      phone: '',
      email: '',
      associationId: props.associations[0]?.id ?? '',
      role: '' as CreateUserSchemaType['role'],
    },
    mode: 'onChange',
  });

  // Only offer roles valid for the selected account's product; the database
  // rejects anything else (enforce_role_product_match).
  const selectedAssociationId = useWatch({
    control: form.control,
    name: 'associationId',
  });
  const roleOptions =
    ROLES_BY_PRODUCT[
      props.associations.find((a) => a.id === selectedAssociationId)
        ?.productType ?? 'association'
    ];

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
            Enter the user&apos;s name, phone number and email, then assign them
            to an association. They can sign in via phone OTP (primary) or email
            OTP (secondary).
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
                    <PhoneInput
                      required
                      placeholder={'e.g. 9911000001'}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>

                  <FormDescription>
                    Enter the 10-digit Indian mobile number.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name={'email'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>

                  <FormControl>
                    <Input
                      required
                      type="email"
                      placeholder={'e.g. rajesh@example.com'}
                      {...field}
                    />
                  </FormControl>

                  <FormDescription>
                    Used as the secondary email-OTP login.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name={'associationId'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Association</FormLabel>

                  <FormControl>
                    <SearchableSelect
                      className="w-full"
                      data-test={'admin-user-association-select'}
                      items={props.associations.map((association) => ({
                        value: association.id,
                        label: association.name,
                      }))}
                      value={field.value}
                      onChange={(value) => {
                        field.onChange(value);
                        form.resetField('role');
                      }}
                      onBlur={field.onBlur}
                      placeholder="Select an association"
                      searchPlaceholder="Search associations…"
                      emptyMessage="No associations found"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name={'role'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>

                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a role">
                          {(value: string) =>
                            ROLE_LABELS[value as keyof typeof ROLE_LABELS] ??
                            'Select a role'
                          }
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>

                    <SelectContent>
                      {roleOptions.map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
