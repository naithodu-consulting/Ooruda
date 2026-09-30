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
                    <FormLabel>Let managers cancel bookings</FormLabel>
                    <FormDescription>
                      Managers can then cancel and refund by the cancellation
                      policy. Changing a refund amount always stays with the
                      owner.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={disabled}
                      data-test={'villa-policies-managers-cancel'}
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
                    The name guests see on receipt vouchers. Leave empty to use
                    the villa name.
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
                    Printed on receipts once your villa is GST-registered.
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
                    <FormLabel>Email before arrival</FormLabel>
                    <FormDescription>
                      The day before check-in at 10 am: dates, times, ID
                      reminder and contacts. Only if the stay is still confirmed
                      then.
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
                    <FormLabel>Thank-you email after check-out</FormLabel>
                    <FormDescription>
                      3 hours after you check the guest out on the booking (not
                      on the calendar date), so a late or extended stay is never
                      thanked early.
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
            <CardTitle className="text-base">Online travel sites</CardTitle>
            <CardDescription>
              When you block dates or take a phone booking, booking sites like
              MakeMyTrip can take a few minutes to catch up.
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
