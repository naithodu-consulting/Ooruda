'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useAction } from 'next-safe-action/hooks';
import { useForm } from 'react-hook-form';

import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
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
import { toast } from '@kit/ui/sonner';

import {
  type BusinessDetailsInput,
  BusinessDetailsSchema,
} from '../_lib/schemas/villa-settings.schema';
import { saveBusinessDetailsAction } from '../_lib/server/villa-settings-actions';

/**
 * The company behind the villa. These fields print in the footer of the guest
 * booking confirmation and as the supplier on receipt vouchers, so they are
 * the villa's own to keep correct rather than something support fills in.
 */
export function BusinessDetailsCard(props: {
  accountId: string;
  propertyId: string;
  canEdit: boolean;
  legalName: string | null;
  gstin: string | null;
  legalAddress: string | null;
  cin: string | null;
  supportEmail: string | null;
  whatsappNumber?: string | null;
}) {
  const form = useForm<BusinessDetailsInput>({
    resolver: zodResolver(BusinessDetailsSchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      accountId: props.accountId,
      propertyId: props.propertyId,
      legalName: props.legalName ?? '',
      gstin: props.gstin ?? '',
      legalAddress: props.legalAddress ?? '',
      cin: props.cin ?? '',
      supportEmail: props.supportEmail ?? '',
      whatsappNumber: props.whatsappNumber ?? '',
    },
  });

  const { execute, isPending } = useAction(saveBusinessDetailsAction, {
    onSuccess: () => {
      toast.success('Business details saved');
      form.reset(form.getValues());
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not save the business details.'),
  });

  const disabled = !props.canEdit || isPending;

  return (
    <Form {...form}>
      <form
        data-test={'villa-business-form'}
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) => execute(values))}
      >
        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-base">Business details</CardTitle>
            <CardDescription>
              Printed on guest receipts and in the footer of the booking
              confirmation email. Leave anything you do not have empty - it is
              left out rather than shown blank.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              name="legalName"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Business name</FormLabel>
                  <FormControl
                    render={
                      <Input
                        {...field}
                        disabled={disabled}
                        data-test={'villa-business-legal-name'}
                      />
                    }
                  />
                  <FormDescription>
                    The legal entity name. Leave empty to use the villa name.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="supportEmail"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Guest contact email</FormLabel>
                  <FormControl
                    render={
                      <Input
                        {...field}
                        type="email"
                        disabled={disabled}
                        data-test={'villa-business-support-email'}
                      />
                    }
                  />
                  <FormDescription>
                    Where guests write to cancel or ask a question. Defaults to
                    the address guest email is sent from.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="whatsappNumber"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>WhatsApp number</FormLabel>
                  <FormControl
                    render={
                      <Input
                        {...field}
                        disabled={disabled}
                        placeholder="+91 80504 84123"
                        data-test={'villa-business-whatsapp-number'}
                      />
                    }
                  />
                  <FormDescription>
                    Shown to guests as the fastest way to reach the villa. Leave
                    empty to use the central reservations number.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="legalAddress"
              control={form.control}
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Registered address</FormLabel>
                  <FormControl
                    render={
                      <Input
                        {...field}
                        disabled={disabled}
                        data-test={'villa-business-legal-address'}
                      />
                    }
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="gstin"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>GSTIN</FormLabel>
                  <FormControl
                    render={
                      <Input
                        {...field}
                        disabled={disabled}
                        className="font-mono uppercase"
                        data-test={'villa-business-gstin'}
                      />
                    }
                  />
                  <FormDescription>
                    This villa’s GST registration. Printed on receipts, tax
                    invoices and the guest email footer.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="cin"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CIN</FormLabel>
                  <FormControl
                    render={
                      <Input
                        {...field}
                        disabled={disabled}
                        className="font-mono uppercase"
                        data-test={'villa-business-cin'}
                      />
                    }
                  />
                  <FormDescription>
                    Company Identification Number, if a registered company runs
                    the villa.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {props.canEdit ? (
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={disabled || !form.formState.isDirty}
              data-test={'villa-business-save'}
            >
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        ) : null}
      </form>
    </Form>
  );
}
