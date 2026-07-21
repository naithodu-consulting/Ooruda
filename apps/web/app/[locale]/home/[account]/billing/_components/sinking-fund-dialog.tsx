'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2 } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { Badge } from '@kit/ui/badge';
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
import { Spinner } from '@kit/ui/spinner';

import { formatINR } from '~/lib/format-inr';

import {
  addSinkingFundChargeToUnitAction,
  bulkAddSinkingFundChargeAction,
  removePendingSinkingFundChargeAction,
  type PendingSinkingFundCharge,
} from '../_lib/billing-actions';

const ChargeSchema = z
  .object({
    scope: z.enum(['unit', 'all']),
    unit_id: z.string().optional(),
    period: z.string().min(7, 'Required'),
    label: z.string().min(1, 'Description is required'),
    amount: z.coerce.number().positive('Amount must be positive'),
    split_mode: z.enum(['flat', 'per_sqft']).optional(),
    due_date: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.scope === 'unit' && !data.unit_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Please select a unit.',
        path: ['unit_id'],
      });
    }
  });

interface UnitOption {
  id: string;
  unit_no: string;
}

interface PendingChargeWithUnit extends PendingSinkingFundCharge {
  unit_no?: string | null;
  period: string;
}

interface Props {
  associationId: string;
  units: UnitOption[];
  pendingCharges: PendingChargeWithUnit[];
  periods: string[]; // YYYY-MM, most recent first
}

function getPeriodOptions(periods: string[]) {
  return periods.map((p) => ({
    value: p,
    label: new Date(`${p}-01T00:00:00`).toLocaleString('en-IN', {
      month: 'long',
      year: 'numeric',
    }),
  }));
}

export function SinkingFundDialog(props: Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            data-test="sinking-fund-dialog-trigger"
          >
            Sinking Fund
          </Button>
        }
      />

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sinking Fund</DialogTitle>
          <DialogDescription>
            Stage sinking fund charges before generating bills.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <AddChargeForm
            associationId={props.associationId}
            units={props.units}
            periods={props.periods}
            onSuccess={() => setIsOpen(false)}
          />

          {props.pendingCharges.length > 0 && (
            <PendingChargesList
              associationId={props.associationId}
              charges={props.pendingCharges}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddChargeForm(props: {
  associationId: string;
  units: UnitOption[];
  periods: string[];
  onSuccess: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const form = useForm({
    resolver: zodResolver(ChargeSchema),
    defaultValues: {
      scope: 'unit' as const,
      period: defaultPeriod,
      label: '',
      amount: undefined,
      split_mode: 'flat' as const,
    },
  });

  const scope = useWatch({ control: form.control, name: 'scope' });
  const splitMode = useWatch({ control: form.control, name: 'split_mode' });
  const periodOptions = getPeriodOptions(props.periods);

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      let result: { success: boolean; error?: string };

      if (values.scope === 'unit') {
        result = await addSinkingFundChargeToUnitAction(props.associationId, {
          unit_id: values.unit_id!,
          period: values.period,
          label: values.label,
          amount: values.amount,
          due_date: values.due_date || null,
        });
      } else {
        result = await bulkAddSinkingFundChargeAction(props.associationId, {
          period: values.period,
          label: values.label,
          amount: values.amount,
          split_mode: values.split_mode ?? 'flat',
          due_date: values.due_date || null,
        });
      }

      if (!result.success) {
        toast.error(result.error ?? 'Could not add charge.');
        return;
      }

      toast.success('Sinking Fund charge added.');
      form.reset({
        scope: values.scope,
        period: values.period,
        label: '',
        amount: undefined,
        split_mode: values.split_mode,
      });
      router.refresh();
      props.onSuccess();
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          {/* Scope */}
          <FormField
            name="scope"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Apply to</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue>
                        {(value: string) => {
                          if (value === 'unit') return 'Specific Unit';
                          if (value === 'all') return 'All Units';
                          return '';
                        }}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="unit">Specific Unit</SelectItem>
                    <SelectItem value="all">All Units</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Period */}
          <FormField
            name="period"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Period</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue>
                        {(value: string) =>
                          periodOptions.find((opt) => opt.value === value)
                            ?.label ?? 'Select period'
                        }
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {periodOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {scope === 'unit' && (
          <FormField
            name="unit_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unit</FormLabel>
                <Select
                  value={field.value ?? ''}
                  onValueChange={(v) => v && field.onChange(v)}
                >
                  <FormControl>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select a unit">
                        {(value: string) =>
                          props.units.find((u) => u.id === value)?.unit_no ??
                          'Select a unit'
                        }
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {props.units.map((u) => (
                      <SelectItem key={u.id} value={u.id} label={u.unit_no}>
                        {u.unit_no}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {scope === 'all' && (
          <FormField
            name="split_mode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Split method</FormLabel>
                <Select
                  value={field.value ?? 'flat'}
                  onValueChange={field.onChange}
                >
                  <FormControl>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue>
                        {(value: string) => {
                          if (value === 'flat') return 'Flat Amount';
                          if (value === 'per_sqft') return 'Per sqft';
                          return 'Flat Amount';
                        }}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="flat">Flat Amount</SelectItem>
                    <SelectItem value="per_sqft">Per sqft</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField
            name="label"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. Q1 Apr–Jun 2026"
                    className="h-9 text-sm"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Amount (₹
                  {scope === 'all'
                    ? splitMode === 'per_sqft'
                      ? '/sqft'
                      : '/unit'
                    : ''}
                  )
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="h-9 text-sm"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          name="due_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Due Date{' '}
                <span className="text-muted-foreground font-normal">
                  (optional — overrides default)
                </span>
              </FormLabel>
              <FormControl>
                <Input
                  type="date"
                  className="h-9 text-sm"
                  {...field}
                  value={field.value ?? ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          size="sm"
          disabled={isPending}
          className="self-start"
        >
          {isPending && <Spinner className="mr-2 h-4 w-4" />}
          Add Charge
        </Button>
      </form>
    </Form>
  );
}

function PendingChargesList(props: {
  associationId: string;
  charges: PendingChargeWithUnit[];
}) {
  const router = useRouter();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handleRemove = (chargeId: string) => {
    setRemovingId(chargeId);
    startTransition(async () => {
      const result = await removePendingSinkingFundChargeAction(
        props.associationId,
        chargeId,
      );
      setRemovingId(null);

      if (!result.success) {
        toast.error(result.error ?? 'Could not remove charge.');
        return;
      }
      toast.success('Charge removed.');
      router.refresh();
    });
  };

  const byPeriod = props.charges.reduce<
    Record<string, PendingChargeWithUnit[]>
  >((acc, c) => {
    (acc[c.period] ??= []).push(c);
    return acc;
  }, {});

  const sortedPeriods = Object.keys(byPeriod).sort((a, b) =>
    b.localeCompare(a),
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Staged charges
      </p>

      {sortedPeriods.map((period) => (
        <div key={period} className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs">
            {new Date(`${period}-01T00:00:00`).toLocaleString('en-IN', {
              month: 'long',
              year: 'numeric',
            })}
          </p>

          {byPeriod[period]!.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">{c.label}</span>
                  {c.billed && (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                      Billed
                    </Badge>
                  )}
                </div>
                <span className="text-muted-foreground text-xs">
                  {c.unit_id
                    ? (c.unit_no ?? 'Unit')
                    : c.split_mode === 'per_sqft'
                      ? 'All units · ₹/sq.ft'
                      : 'All units · flat'}
                  {c.due_date
                    ? ` · Due ${new Date(`${c.due_date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                    : ''}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold tabular-nums">
                  {formatINR(c.amount)}
                </span>
                {!c.billed && (
                  <button
                    type="button"
                    data-test={`remove-sinking-charge-${c.id}`}
                    onClick={() => handleRemove(c.id)}
                    disabled={removingId === c.id}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="Remove"
                  >
                    {removingId === c.id ? (
                      <Spinner className="h-3.5 w-3.5" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
