'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck } from 'lucide-react';
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
import { PhoneInput } from '@kit/ui/phone-input';
import { toast } from '@kit/ui/sonner';
import { Switch } from '@kit/ui/switch';

import {
  type PoliciesInput,
  PoliciesSchema,
} from '../_lib/schemas/villa-settings.schema';
import { savePoliciesAction } from '../_lib/server/villa-settings-actions';

export function PoliciesForm(props: {
  accountId: string;
  propertyId: string;
  canEdit: boolean;
  managersCanCancel: boolean;
  preArrivalEmail: boolean;
  thankYouEmail: boolean;
  otaBufferNights: number;
  whatsappNumber: string | null;
  legalName: string | null;
  gstin: string | null;
  retentionDays: number;
}) {
  const form = useForm<PoliciesInput>({
    resolver: zodResolver(PoliciesSchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      accountId: props.accountId,
      propertyId: props.propertyId,
      managersCanCancel: props.managersCanCancel,
      preArrivalEmail: props.preArrivalEmail,
      thankYouEmail: props.thankYouEmail,
      otaBufferNights: props.otaBufferNights,
      whatsappNumber: props.whatsappNumber ?? '',
      legalName: props.legalName ?? '',
      gstin: props.gstin ?? '',
    },
  });

  const { execute, isPending } = useAction(savePoliciesAction, {
    onSuccess: () => {
      toast.success('Settings saved');
      form.reset(form.getValues());
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not save the settings.'),
  });

  const disabled = !props.canEdit || isPending;

  return (
    <Form {...form}>
      <form
        data-test={'villa-policies-form'}
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) => execute(values))}
      >
        {props.canEdit ? (
          <Card className="bg-card">
            <CardHeader>
              <CardTitle className="text-base">Cancellations</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                name="managersCanCancel"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-3">
                    <div className="flex flex-col gap-1">
                      <FormLabel>Allow managers to cancel bookings</FormLabel>
                      <FormDescription>
                        Managers can cancel bookings and issue policy-standard
                        refunds. Custom refund amounts remain owner-only.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isPending}
                        data-test={'villa-policies-managers-cancel'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        ) : null}

        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-base">Business details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FormField
              name="legalName"
              control={form.control}
              render={({ field }) => (
                <FormItem className="max-w-md">
                  <FormLabel>Business name on receipts</FormLabel>
                  <FormControl
                    render={
                      <Input
                        {...field}
                        disabled={disabled}
                        data-test={'villa-policies-legal-name'}
                      />
                    }
                  />
                  <FormDescription>
                    The legal entity name printed on payment receipts. Leave
                    empty to use the villa name.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              name="gstin"
              control={form.control}
              render={({ field }) => (
                <FormItem className="max-w-md">
                  <FormLabel>GSTIN (optional)</FormLabel>
                  <FormControl
                    render={
                      <Input
                        {...field}
                        disabled={disabled}
                        className="font-mono uppercase"
                        data-test={'villa-policies-gstin'}
                      />
                    }
                  />
                  <FormDescription>
                    Printed on receipts and tax invoices once registered.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-base">Guest emails</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <FormField
              name="preArrivalEmail"
              control={form.control}
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-3">
                  <div className="flex flex-col gap-1">
                    <FormLabel>Pre-arrival welcome email</FormLabel>
                    <FormDescription>
                      Sends at 10:00 AM the day before check-in with directions,
                      check-in time, ID requirements, and staff contact numbers.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={disabled}
                      data-test={'villa-policies-pre-arrival-email'}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              name="thankYouEmail"
              control={form.control}
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-3">
                  <div className="flex flex-col gap-1">
                    <FormLabel>Post-checkout thank-you email</FormLabel>
                    <FormDescription>
                      Sends 3 hours after staff mark the stay completed at
                      check-out.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={disabled}
                      data-test={'villa-policies-thank-you-email'}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-base">Online travel channels</CardTitle>
            <CardDescription>
              External booking platforms sync periodically. Buffer nights help
              prevent overlapping reservations during sync windows.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              name="otaBufferNights"
              control={form.control}
              render={({ field }) => (
                <FormItem className="max-w-xs">
                  <FormLabel>Buffer nights around manual blocks</FormLabel>
                  <FormControl
                    render={
                      <Input
                        {...field}
                        value={
                          (field.value as string | number | undefined) ?? ''
                        }
                        inputMode="numeric"
                        disabled={disabled}
                        data-test={'villa-policies-ota-buffer'}
                      />
                    }
                  />
                  <FormDescription>
                    0 to 14. Use 0 if you do not list on OTAs.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="text-muted-foreground h-4 w-4" />
              Guest ID documents
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FormField
              name="whatsappNumber"
              control={form.control}
              render={({ field }) => (
                <FormItem className="max-w-sm">
                  <FormLabel>Villa WhatsApp number</FormLabel>
                  <FormControl
                    render={
                      <PhoneInput
                        name={field.name}
                        ref={field.ref}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        disabled={disabled}
                        data-test={'villa-policies-whatsapp'}
                      />
                    }
                  />
                  <FormDescription>
                    Guests send their ID photos here. Used in the ID request you
                    send from a booking.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div>
              <p className="text-sm" data-test={'villa-policies-retention'}>
                Kept for <strong>{props.retentionDays} days</strong> after
                check-out, then deleted automatically.
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Set by Ooruda to match the privacy policy. Contact support to
                change it.
              </p>
            </div>
          </CardContent>
        </Card>

        {props.canEdit ? (
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={isPending || !form.formState.isDirty}
              className="w-full sm:w-auto"
              data-test={'villa-policies-save'}
            >
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        ) : null}
      </form>
    </Form>
  );
}
