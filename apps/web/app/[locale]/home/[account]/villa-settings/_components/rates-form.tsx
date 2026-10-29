'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useAction } from 'next-safe-action/hooks';
import { useForm, useWatch } from 'react-hook-form';

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
import {
  SearchableSelect,
  type SearchableSelectOption,
} from '@kit/ui/searchable-select';
import { toast } from '@kit/ui/sonner';

import { RupeeInput } from '~/components/rupee-input';
import { formatINR } from '~/lib/format-inr';
import type { BaseRates } from '~/lib/villa-db/rates';

import {
  type BaseRatesInput,
  BaseRatesSchema,
} from '../_lib/schemas/villa-settings.schema';
import { saveBaseRatesAction } from '../_lib/server/villa-settings-actions';

const TIME_OPTIONS: SearchableSelectOption[] = Array.from(
  { length: 48 },
  (_, i) => {
    const h = String(Math.floor(i / 2)).padStart(2, '0');
    const value = `${h}:${i % 2 ? '30' : '00'}`;
    return { value, label: value };
  },
);

function toHHMM(value: string | null, fallback: string) {
  return value ? value.slice(0, 5) : fallback;
}

function money(value: number | null) {
  return value == null ? '' : String(value);
}

function describeExtras(v: {
  includedGuests: unknown;
  maxGuests: unknown;
  extraGuestRate: string;
  extraGuestTier2Rate: string;
  extraGuestTier2From: unknown;
}): string | null {
  const included = Number(v.includedGuests);
  const max = Number(v.maxGuests);
  const rate = Number(v.extraGuestRate);

  if (!included || !max || max <= included || !Number.isFinite(rate))
    return null;

  const first = included + 1;
  const tier2From =
    v.extraGuestTier2From === '' ? null : Number(v.extraGuestTier2From);
  const tier2Rate =
    v.extraGuestTier2Rate === '' ? null : Number(v.extraGuestTier2Rate);

  if (tier2From && tier2Rate != null && tier2From > first && tier2From <= max) {
    return `Guests ${first}–${tier2From - 1} pay ${formatINR(rate)} each per night; guests ${tier2From}–${max} pay ${formatINR(tier2Rate)}.`;
  }

  return `Guests ${first}–${max} pay ${formatINR(rate)} each per night.`;
}

export function RatesForm(props: {
  accountId: string;
  propertyId: string;
  canEdit: boolean;
  rates: BaseRates;
}) {
  const form = useForm<BaseRatesInput>({
    resolver: zodResolver(BaseRatesSchema),
    defaultValues: {
      accountId: props.accountId,
      propertyId: props.propertyId,
      weekdayNightly: money(props.rates.weekdayNightly),
      weekendNightly: money(props.rates.weekendNightly),
      includedGuests: props.rates.includedGuests,
      maxGuests: props.rates.maxGuests,
      idealGuests: props.rates.idealOccupancy ?? props.rates.includedGuests,
      extraGuestRate: money(props.rates.extraGuestRate),
      extraGuestTier2Rate: money(props.rates.extraGuestTier2Rate),
      extraGuestTier2From: props.rates.extraGuestTier2From ?? '',
      checkInTime: toHHMM(props.rates.checkInTime, '14:00'),
      checkOutTime: toHHMM(props.rates.checkOutTime, '11:00'),
    },
  });

  const watched = useWatch({ control: form.control });
  const extrasSummary = describeExtras({
    includedGuests: watched.includedGuests,
    maxGuests: watched.maxGuests,
    extraGuestRate: watched.extraGuestRate ?? '',
    extraGuestTier2Rate: watched.extraGuestTier2Rate ?? '',
    extraGuestTier2From: watched.extraGuestTier2From ?? '',
  });

  const { execute, isPending } = useAction(saveBaseRatesAction, {
    onSuccess: () => {
      toast.success('Rates saved. New bookings use them straight away.');
      form.reset(form.getValues());
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not save the rates.'),
  });

  const disabled = !props.canEdit || isPending;

  const moneyField = (
    name:
      | 'weekdayNightly'
      | 'weekendNightly'
      | 'extraGuestRate'
      | 'extraGuestTier2Rate',
    label: string,
    description?: string,
  ) => (
    <FormField
      name={name}
      control={form.control}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl
            render={
              <RupeeInput
                {...field}
                disabled={disabled}
                data-test={`villa-rates-${name}`}
              />
            }
          />
          {description ? (
            <FormDescription>{description}</FormDescription>
          ) : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  const numberField = (
    name:
      | 'includedGuests'
      | 'maxGuests'
      | 'idealGuests'
      | 'extraGuestTier2From',
    label: string,
    description?: string,
  ) => (
    <FormField
      name={name}
      control={form.control}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl
            render={
              <Input
                {...field}
                value={(field.value as string | number | undefined) ?? ''}
                inputMode="numeric"
                disabled={disabled}
                data-test={`villa-rates-${name}`}
              />
            }
          />
          {description ? (
            <FormDescription>{description}</FormDescription>
          ) : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  const timeField = (name: 'checkInTime' | 'checkOutTime', label: string) => (
    <FormField
      name={name}
      control={form.control}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <SearchableSelect
              items={TIME_OPTIONS}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              disabled={disabled}
              placeholder="Select time"
              searchPlaceholder="Type time (e.g. 14:00)…"
              data-test={`villa-rates-${name}`}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form
        data-test={'villa-rates-form'}
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) => execute(values))}
      >
        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-base">Nightly rates</CardTitle>
            <CardDescription>
              Used by the booking site for new bookings, and for phone and
              WhatsApp quotes here. Seasonal rates override these.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {moneyField(
              'weekdayNightly',
              'Weekday nights',
              'Sunday to Thursday',
            )}
            {moneyField(
              'weekendNightly',
              'Weekend nights',
              'Friday and Saturday',
            )}
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-base">Guests</CardTitle>
            <CardDescription>
              Children count as guests; infants do not.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {numberField('includedGuests', 'Guests included in the rate')}
            {numberField('maxGuests', 'Maximum guests')}
            {numberField(
              'idealGuests',
              'Ideal for (guests)',
              'Shown on the booking site ("Ideal for 8–14 guests") and used as the default guest count.',
            )}
            <div className="hidden sm:block" />
            {moneyField('extraGuestRate', 'Extra guest, per night')}
            <div className="hidden sm:block" />
            {numberField(
              'extraGuestTier2From',
              'Second tier starts from guest (optional)',
              'Leave empty for a single extra-guest rate.',
            )}
            {moneyField(
              'extraGuestTier2Rate',
              'Second-tier rate, per night (optional)',
            )}
            {extrasSummary ? (
              <p
                className="text-muted-foreground text-sm sm:col-span-2"
                data-test={'villa-rates-extras-summary'}
              >
                {extrasSummary}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-base">Check-in and check-out</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {timeField('checkInTime', 'Check-in from')}
            {timeField('checkOutTime', 'Check-out by')}
          </CardContent>
        </Card>

        {props.canEdit ? (
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={disabled || !form.formState.isDirty}
              className="w-full sm:w-auto"
              data-test={'villa-rates-save'}
            >
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        ) : null}
      </form>
    </Form>
  );
}
