'use client';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { useAction } from 'next-safe-action/hooks';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { normalizePhoneNumber } from '@kit/shared/utils';
import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@kit/ui/form';
import { Input } from '@kit/ui/input';
import { PhoneInput } from '@kit/ui/phone-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { toast } from '@kit/ui/sonner';

import { updateUserDetailsAction } from '../lib/server/admin-server-actions';
import {
  ASSIGNABLE_ROLES,
  ROLE_LABELS,
} from '../lib/server/schema/create-user.schema';

export function AdminEditUserDialog(
  props: React.PropsWithChildren<{
    userId: string;
    userName: string;
    userPhone: string;
    userEmail?: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    teamAccountId?: string;
    currentRole?: string;
  }>,
) {
  const router = useRouter();
  const isTeamMode = !!props.teamAccountId;

  // Form validation schema: enforces mandatory name, phone, and role (if team mode)
  const FormSchema = z.object({
    fullName: z
      .string()
      .min(2, { message: 'Full name must be at least 2 characters' }),
    phone: z.string().refine((v) => normalizePhoneNumber(v) !== null, {
      message: 'Enter a valid 10-digit Indian mobile number',
    }),
    email: z
      .string()
      .min(1, { message: 'Email is required' })
      .email({ message: 'Please enter a valid email address' }),
    role: isTeamMode
      ? z.enum(ASSIGNABLE_ROLES, { message: 'Please select a role' })
      : z.string().optional(),
  });

  type FormSchemaType = z.infer<typeof FormSchema>;

  const form = useForm<FormSchemaType>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      fullName: props.userName,
      // PhoneInput expects E.164 (e.g. "+918826262459") — it parses country + national internally.
      phone: props.userPhone || '',
      email: props.userEmail || '',
      role: props.currentRole || '',
    },
    mode: 'onChange',
  });

  const { execute, isPending, result } = useAction(updateUserDetailsAction, {
    onSuccess: () => {
      toast.success('User details updated successfully');
      router.refresh();
      if (props.onOpenChange) {
        props.onOpenChange(false);
      }
    },
    onError: (err) => {
      toast.error(err.error?.serverError ?? 'Failed to update user');
    },
  });

  const error = result.serverError;

  const onSubmit = (values: FormSchemaType) => {
    execute({
      userId: props.userId,
      fullName: values.fullName,
      phone: values.phone,
      email: values.email,
      associationId: props.teamAccountId,
      role: isTeamMode ? (values.role as any) : undefined,
    });
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.children && (
        <DialogTrigger render={props.children as React.ReactElement} />
      )}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit User Details</DialogTitle>
          <DialogDescription>
            {isTeamMode
              ? "Update this member's profile details and role in the current team account."
              : "Update this user's profile name and phone number."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className={'flex flex-col space-y-4'}
          >
            {error && (
              <Alert variant={'destructive'}>
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <FormField
              name={'fullName'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input
                      required
                      type="text"
                      placeholder={'Full Name'}
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
                      placeholder={'Phone Number'}
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

            {isTeamMode && (
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
                        {ASSIGNABLE_ROLES.map((role) => (
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
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => props.onOpenChange?.(false)}
              >
                Cancel
              </Button>
              <Button disabled={isPending} type="submit">
                {isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
