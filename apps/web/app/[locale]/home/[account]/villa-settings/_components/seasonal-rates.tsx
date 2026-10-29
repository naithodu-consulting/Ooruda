'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2 } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useForm, useWatch } from 'react-hook-form';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@kit/ui/alert-dialog';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { DatePicker } from '@kit/ui/date-picker';
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

import { RupeeInput } from '~/components/rupee-input';
import { todayInBillingZone } from '~/lib/billing-dates';
import { formatDateReadable } from '~/lib/format-date';
import { formatINR } from '~/lib/format-inr';
import { lastNightOf, nightsIn } from '~/lib/villa-db/dates';
import type { PricingRule } from '~/lib/villa-db/rates';

import {
  type SeasonalRateInput,
  SeasonalRateSchema,
} from '../_lib/schemas/villa-settings.schema';
import {
  addSeasonalRateAction,
  deleteSeasonalRateAction,
} from '../_lib/server/villa-settings-actions';

export function SeasonalRates(props: {
  accountId: string;
  propertyId: string;
  canEdit: boolean;
  rules: PricingRule[];
}) {
  const today = todayInBillingZone();

  return (
    <div className="flex flex-col gap-4">
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-base">
            Seasonal and holiday rates
          </CardTitle>
          <CardDescription>
            A seasonal rate replaces both the weekday and weekend rate for every
            night it covers. Rates cannot overlap.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {props.rules.length === 0 ? (
            <p
              className="text-muted-foreground text-sm"
              data-test={'villa-seasonal-empty'}
            >
              No seasonal rates. Every night uses the weekday or weekend rate.
            </p>
          ) : (
            <ul className="divide-border divide-y rounded-lg border">
              {props.rules.map((rule) => {
                const last = lastNightOf(rule.endDate);
                const nights = nightsIn(rule.startDate, rule.endDate);
                const past = last < today;

                return (
                  <li
                    key={rule.id}
                    data-test={'villa-seasonal-row'}
                    className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {rule.name}
                        {past ? (
                          <span className="text-muted-foreground font-normal">
                            {' '}
                            · past
                          </span>
                        ) : null}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {formatDateReadable(rule.startDate)}
                        {rule.startDate !== last
                          ? ` – ${formatDateReadable(last)}`
                          : ''}
                        {' · '}
                        {nights === 1 ? '1 night' : `${nights} nights`}
                        {rule.minStayNights > 1
                          ? ` · min stay ${rule.minStayNights}`
                          : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums">
                        {formatINR(rule.nightlyRate)}
                        <span className="text-muted-foreground font-normal">
                          {' '}
                          / night
                        </span>
                      </span>
                      {props.canEdit ? (
                        <DeleteRuleButton
                          accountId={props.accountId}
                          propertyId={props.propertyId}
                          rule={rule}
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {props.canEdit ? (
        <AddSeasonalRateForm
          accountId={props.accountId}
          propertyId={props.propertyId}
        />
      ) : null}
    </div>
  );
}

function AddSeasonalRateForm(props: { accountId: string; propertyId: string }) {
  const today = todayInBillingZone();

  const empty: SeasonalRateInput = {
    accountId: props.accountId,
    propertyId: props.propertyId,
    name: '',
    firstNight: '',
    lastNight: '',
    nightlyRate: '',
    minStayNights: 1,
  };

  const form = useForm<SeasonalRateInput>({
    resolver: zodResolver(SeasonalRateSchema),
    defaultValues: empty,
  });

  const firstNight = useWatch({ control: form.control, name: 'firstNight' });

  const { execute, isPending } = useAction(addSeasonalRateAction, {
    onSuccess: () => {
      toast.success('Seasonal rate added');
      form.reset(empty);
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not add the rate.'),
  });

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="text-base">Add a seasonal rate</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            data-test={'villa-seasonal-form'}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            onSubmit={form.handleSubmit((values) => execute(values))}
          >
            <FormField
              name="name"
              control={form.control}
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Name</FormLabel>
                  <FormControl
                    render={
                      <Input
                        {...field}
                        placeholder="e.g. Diwali, New Year"
                        data-test={'villa-seasonal-name'}
                      />
                    }
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="firstNight"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First night</FormLabel>
                  <FormControl>
                    <DatePicker
                      value={field.value}
                      onChange={(value) => {
                        field.onChange(value);
                        const last = form.getValues('lastNight');
                        if (value && (!last || last < value)) {
                          form.setValue('lastNight', value, {
                            shouldValidate: true,
                          });
                        }
                      }}
                      onBlur={field.onBlur}
                      min={today}
                      data-test={'villa-seasonal-first'}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="lastNight"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last night</FormLabel>
                  <FormControl>
                    <DatePicker
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      min={firstNight || today}
                      data-test={'villa-seasonal-last'}
                    />
                  </FormControl>
                  <FormDescription>
                    The last night guests stay at this rate (not the check-out
                    day).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="nightlyRate"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rate per night</FormLabel>
                  <FormControl
                    render={
                      <RupeeInput
                        {...field}
                        data-test={'villa-seasonal-rate'}
                      />
                    }
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="minStayNights"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Minimum stay (nights)</FormLabel>
                  <FormControl
                    render={
                      <Input
                        {...field}
                        value={
                          (field.value as string | number | undefined) ?? ''
                        }
                        inputMode="numeric"
                        data-test={'villa-seasonal-minstay'}
                      />
                    }
                  />
                  <FormDescription>
                    Applies to any stay that includes one of these nights.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end sm:col-span-2">
              <Button
                type="submit"
                disabled={isPending}
                className="w-full sm:w-auto"
                data-test={'villa-seasonal-submit'}
              >
                {isPending ? 'Adding…' : 'Add seasonal rate'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function DeleteRuleButton(props: {
  accountId: string;
  propertyId: string;
  rule: PricingRule;
}) {
  const { execute, isPending } = useAction(deleteSeasonalRateAction, {
    onSuccess: () => toast.success('Seasonal rate removed'),
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not remove the rate.'),
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${props.rule.name}`}
            data-test={'villa-seasonal-delete'}
          />
        }
      >
        <Trash2 className="h-4 w-4" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove “{props.rule.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Those nights go back to the weekday and weekend rates for new
            bookings. Existing bookings keep their price.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* Not AlertDialogFooter: its bg-muted band clashes with the white
            dialog (same issue as DialogFooter). */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel data-test={'villa-seasonal-delete-cancel'}>
            Cancel
          </AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={isPending}
            data-test={'villa-seasonal-delete-confirm'}
            onClick={() =>
              execute({
                accountId: props.accountId,
                propertyId: props.propertyId,
                ruleId: props.rule.id,
              })
            }
          >
            {isPending ? 'Removing…' : 'Remove'}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
