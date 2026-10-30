'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { Info, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import {
  type Resolver,
  useFieldArray,
  useForm,
  useWatch,
} from 'react-hook-form';

import { Alert, AlertDescription } from '@kit/ui/alert';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent } from '@kit/ui/card';
import { DatePicker } from '@kit/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { toast } from '@kit/ui/sonner';
import { cn } from '@kit/ui/utils';

import { RupeeInput } from '~/components/rupee-input';
import { formatDateReadable } from '~/lib/format-date';
import { formatINR } from '~/lib/format-inr';

import {
  DISCOUNT_CEILING_PCT,
  type DiscountInput,
  DiscountSchema,
  needsApproval,
} from '../_lib/schemas/villa-discounts.schema';
import {
  reviewDiscountAction,
  saveDiscountAction,
  toggleDiscountAction,
} from '../_lib/server/villa-discounts-actions';

export interface DiscountRow {
  id: string;
  code: string;
  discountType: 'percent' | 'flat';
  discountValue: number;
  maxDiscount: number | null;
  validFrom: string;
  validTo: string;
  minNights: number;
  minBookingValue: number;
  maxUses: number | null;
  maxUsesPerGuest: number;
  blackouts: { start: string; lastNight: string }[];
  note: string | null;
  needsApproval: boolean;
  status: 'pending_approval' | 'active' | 'paused' | 'rejected';
  expired: boolean;
  history: { action: string; at: string; actorName: string | null }[];
  usage: {
    timesUsed: number;
    totalDiscount: number;
    lastUsedAt: string | null;
    lastGuestName: string | null;
  } | null;
}

const STATUS: Record<DiscountRow['status'], string> = {
  pending_approval: 'Awaiting Ooruda approval',
  active: 'Active',
  paused: 'Paused',
  rejected: 'Not approved',
};

const ACTION: Record<string, string> = {
  created: 'Created',
  updated: 'Changed',
  paused: 'Paused',
  resumed: 'Resumed',
  approved: 'Approved by Ooruda',
  rejected: 'Refused by Ooruda',
};

function terms(c: DiscountRow): string {
  const off =
    c.discountType === 'percent'
      ? `${c.discountValue}% off, up to ${formatINR(c.maxDiscount ?? 0)}`
      : `${formatINR(c.discountValue)} off`;
  const rules = [
    c.minNights > 1 ? `${c.minNights}+ nights` : null,
    c.minBookingValue > 0
      ? `bookings over ${formatINR(c.minBookingValue)}`
      : null,
    c.maxUses ? `${c.maxUses} uses in all` : 'no overall limit',
    `${c.maxUsesPerGuest} per guest`,
    c.blackouts.length
      ? `${c.blackouts.length} blackout${c.blackouts.length === 1 ? '' : 's'}`
      : null,
  ].filter(Boolean);

  return `${off} · ${rules.join(' · ')}`;
}

export function DiscountsView(props: {
  accountId: string;
  propertyId: string;
  canEdit: boolean;
  canApprove: boolean;
  today: string;
  codes: DiscountRow[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<DiscountRow | 'new' | null>(null);

  const toggle = useAction(toggleDiscountAction, {
    onSuccess: () => router.refresh(),
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not change the code.'),
  });
  const review = useAction(reviewDiscountAction, {
    onSuccess: () => {
      toast.success('Decision saved');
      router.refresh();
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not save the decision.'),
  });

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <Alert data-test={'villa-discounts-info'}>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Discount codes apply only to direct website bookings and cannot be
          combined. Discounts above {DISCOUNT_CEILING_PCT}% require review
          before activation.
        </AlertDescription>
      </Alert>

      {props.canEdit ? (
        <div>
          <Button
            onClick={() => setEditing('new')}
            data-test={'villa-discount-new'}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            New code
          </Button>
        </div>
      ) : null}

      {props.codes.length === 0 ? (
        <Card className="bg-card">
          <CardContent
            className="text-muted-foreground py-10 text-center text-sm"
            data-test={'villa-discounts-empty'}
          >
            No coupon codes yet.
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card overflow-hidden">
          <ul
            className="divide-border divide-y"
            data-test={'villa-discounts-list'}
          >
            {props.codes.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-2 p-4"
                data-test={'villa-discount-row'}
                data-code={c.code}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">
                    {c.code}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      c.status === 'active' &&
                        !c.expired &&
                        'border-success/40 text-success',
                      c.status === 'pending_approval' &&
                        'border-warning/50 text-warning',
                    )}
                    data-test={'villa-discount-status'}
                  >
                    {c.expired && c.status === 'active'
                      ? 'Expired'
                      : STATUS[c.status]}
                  </Badge>
                  {c.needsApproval && c.status === 'active' ? (
                    <Badge variant="outline">
                      <ShieldCheck className="mr-1 h-3 w-3" />
                      Approved above {DISCOUNT_CEILING_PCT}%
                    </Badge>
                  ) : null}

                  <span className="ml-auto flex flex-wrap gap-1">
                    {props.canApprove && c.status === 'pending_approval' ? (
                      <>
                        <Button
                          size="sm"
                          disabled={review.isPending}
                          onClick={() =>
                            review.execute({
                              accountId: props.accountId,
                              id: c.id,
                              approve: true,
                            })
                          }
                          data-test={'villa-discount-approve'}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={review.isPending}
                          onClick={() =>
                            review.execute({
                              accountId: props.accountId,
                              id: c.id,
                              approve: false,
                            })
                          }
                          data-test={'villa-discount-reject'}
                        >
                          Decline
                        </Button>
                      </>
                    ) : null}
                    {props.canEdit &&
                    (c.status === 'active' || c.status === 'paused') ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={toggle.isPending}
                        onClick={() =>
                          toggle.execute({
                            accountId: props.accountId,
                            id: c.id,
                            active: c.status !== 'active',
                          })
                        }
                        data-test={'villa-discount-toggle'}
                      >
                        {c.status === 'active' ? 'Pause' : 'Resume'}
                      </Button>
                    ) : null}
                    {props.canEdit ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Edit ${c.code}`}
                        onClick={() => setEditing(c)}
                        data-test={'villa-discount-edit'}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </span>
                </div>
                <p className="text-sm" data-test={'villa-discount-terms'}>
                  {terms(c)}
                </p>
                <p className="text-muted-foreground text-xs">
                  Bookings made {formatDateReadable(c.validFrom)} to{' '}
                  {formatDateReadable(c.validTo)}
                  {c.note ? ` · ${c.note}` : ''}
                </p>
                {c.history.length ? (
                  <p
                    className="text-muted-foreground text-xs"
                    data-test={'villa-discount-history'}
                  >
                    {c.history
                      .map((h) => {
                        const label = `${ACTION[h.action] ?? h.action} ${formatDateReadable(h.at.slice(0, 10))}`;
                        return h.actorName
                          ? `${label} by ${h.actorName}`
                          : label;
                      })
                      .join(' · ')}
                  </p>
                ) : null}
                <p
                  className="text-muted-foreground text-xs"
                  data-test={'villa-discount-usage'}
                >
                  {c.usage
                    ? `Used ${c.usage.timesUsed} time${c.usage.timesUsed === 1 ? '' : 's'} · ${formatINR(c.usage.totalDiscount)} total discount · last used ${formatDateReadable(c.usage.lastUsedAt!)} by ${c.usage.lastGuestName}`
                    : 'Not used yet'}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {editing ? (
        <DiscountDialog
          accountId={props.accountId}
          propertyId={props.propertyId}
          today={props.today}
          code={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function DiscountDialog(props: {
  accountId: string;
  propertyId: string;
  today: string;
  code: DiscountRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const c = props.code;
  const form = useForm<DiscountInput>({
    resolver: zodResolver(DiscountSchema) as Resolver<DiscountInput>,
    defaultValues: {
      accountId: props.accountId,
      propertyId: props.propertyId,
      id: c?.id ?? '',
      code: c?.code ?? '',
      discountType: c?.discountType ?? 'percent',
      discountValue: c ? String(c.discountValue) : '10',
      maxDiscount: c?.maxDiscount ? String(c.maxDiscount) : '',
      validFrom: c?.validFrom ?? props.today,
      validTo: c?.validTo ?? '',
      minNights: c ? String(c.minNights) : '1',
      minBookingValue: c ? String(c.minBookingValue) : '0',
      maxUses: c?.maxUses ? String(c.maxUses) : '',
      maxUsesPerGuest: c ? String(c.maxUsesPerGuest) : '1',
      blackouts: c?.blackouts ?? [],
      note: c?.note ?? '',
    },
  });
  const blackouts = useFieldArray({ control: form.control, name: 'blackouts' });
  const [type, value, minValue, validFrom] = useWatch({
    control: form.control,
    name: ['discountType', 'discountValue', 'minBookingValue', 'validFrom'],
  });
  const overCeiling = needsApproval({
    discountType: type,
    discountValue: Number(value) || 0,
    minBookingValue: Number(minValue) || 0,
  });

  const { execute, isPending } = useAction(saveDiscountAction, {
    onSuccess: ({ data }) => {
      toast.success(
        data?.status === 'pending_approval'
          ? 'Saved. Ooruda will check it before it can be used.'
          : 'Code saved',
      );
      props.onSaved();
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not save the code.'),
  });

  const num = (
    name: 'discountValue' | 'minNights' | 'maxUses' | 'maxUsesPerGuest',
    label: string,
    hint?: string,
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
                data-test={`villa-discount-${name}`}
              />
            }
          />
          {hint ? <FormDescription>{hint}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  const money = (
    name: 'discountValue' | 'maxDiscount' | 'minBookingValue',
    label: string,
    hint?: string,
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
                value={(field.value as string | number | undefined) ?? ''}
                data-test={`villa-discount-${name}`}
              />
            }
          />
          {hint ? <FormDescription>{hint}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Dialog open onOpenChange={(o) => (!o ? props.onClose() : undefined)}>
      <DialogContent
        className="max-h-[92vh] max-w-2xl overflow-y-auto"
        data-test={'villa-discount-dialog'}
      >
        <DialogHeader>
          <DialogTitle>{c ? `Edit ${c.code}` : 'New coupon code'}</DialogTitle>
          <DialogDescription>
            For guests booking on your website. Any coupon code with over{' '}
            {DISCOUNT_CEILING_PCT}% discount requires Ooruda admin approval.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((v) => execute(v))}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                name="code"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl
                      render={
                        <Input
                          {...field}
                          autoCapitalize="characters"
                          placeholder="MONSOON10"
                          className="font-mono uppercase"
                          data-test={'villa-discount-code'}
                        />
                      }
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                name="discountType"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger
                          className="w-full"
                          data-test={'villa-discount-type'}
                        >
                          <SelectValue>
                            {(v: string) =>
                              v === 'flat'
                                ? 'Flat amount off'
                                : 'Percentage off'
                            }
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem
                          value="percent"
                          data-test={'villa-discount-type-percent'}
                        >
                          Percentage off
                        </SelectItem>
                        <SelectItem
                          value="flat"
                          data-test={'villa-discount-type-flat'}
                        >
                          Flat amount off
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {type === 'percent'
                ? num(
                    'discountValue',
                    'Percent off',
                    `Up to ${DISCOUNT_CEILING_PCT}% without approval.`,
                  )
                : money('discountValue', 'Amount off')}
              {type === 'percent'
                ? money(
                    'maxDiscount',
                    'Max Savings',
                    'Maximum discount that can be given',
                  )
                : null}
              <FormField
                name="validFrom"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valid from</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value}
                        onChange={(v) => {
                          field.onChange(v);
                          const to = form.getValues('validTo');
                          if (v && to && to < v) {
                            form.setValue('validTo', v, {
                              shouldValidate: true,
                            });
                          }
                        }}
                        onBlur={field.onBlur}
                        data-test={'villa-discount-from'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                name="validTo"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valid until</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        min={validFrom || undefined}
                        data-test={'villa-discount-to'}
                      />
                    </FormControl>
                    <FormDescription>The coupon expiry date.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {num(
                'minNights',
                'Minimum nights (optional)',
                'Leave empty for 1.',
              )}
              {money(
                'minBookingValue',
                'Minimum booking value (optional)',
                'Before GST. 0 for none.',
              )}
              {num(
                'maxUses',
                'Max Uses (optional)',
                'Leave empty field for no limit',
              )}
              {num(
                'maxUsesPerGuest',
                'Uses per guest (optional)',
                'Per guest contact number',
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Blackout nights</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={blackouts.fields.length >= 30}
                  onClick={() => blackouts.append({ start: '', lastNight: '' })}
                  data-test={'villa-discount-blackout-add'}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                Stays on these nights cannot use the code (e.g. New Year eve).
              </p>
              {blackouts.fields.map((f, i) => (
                <div
                  key={f.id}
                  className="grid grid-cols-[1fr_1fr_auto] items-start gap-2"
                >
                  {(['start', 'lastNight'] as const).map((k) => (
                    <FormField
                      key={k}
                      name={`blackouts.${i}.${k}`}
                      control={form.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="sr-only">
                            {k === 'start' ? 'First night' : 'Last night'}
                          </FormLabel>
                          <FormControl>
                            <DatePicker
                              value={field.value}
                              onChange={(v) => {
                                field.onChange(v);
                                if (k === 'start' && v) {
                                  const ln = form.getValues(
                                    `blackouts.${i}.lastNight`,
                                  );
                                  if (!ln || ln < v) {
                                    form.setValue(
                                      `blackouts.${i}.lastNight`,
                                      v,
                                      { shouldValidate: true },
                                    );
                                  }
                                }
                              }}
                              onBlur={field.onBlur}
                              min={
                                k === 'lastNight'
                                  ? form.getValues(`blackouts.${i}.start`) ||
                                    undefined
                                  : undefined
                              }
                              data-test={`villa-discount-blackout-${k}`}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove blackout"
                    onClick={() => blackouts.remove(i)}
                    data-test={'villa-discount-blackout-remove'}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <FormField
              name="note"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note (optional)</FormLabel>
                  <FormControl
                    render={
                      <Input {...field} data-test={'villa-discount-note'} />
                    }
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {overCeiling ? (
              <p
                className="text-warning text-sm"
                role="status"
                data-test={'villa-discount-needs-approval'}
              >
                This is above {DISCOUNT_CEILING_PCT}%, so it waits for Ooruda
                approval before it can be used.
              </p>
            ) : null}

            {/* Not DialogFooter: its bg-muted band clashes with the dialog. */}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={props.onClose}
                data-test={'villa-discount-cancel'}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                data-test={'villa-discount-submit'}
              >
                {isPending ? 'Saving…' : 'Save code'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
