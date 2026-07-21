'use client';

import { useEffect, useState, useTransition } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@kit/ui/button';
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
} from '@kit/ui/select';
import { toast } from '@kit/ui/sonner';
import { Spinner } from '@kit/ui/spinner';
import { Textarea } from '@kit/ui/textarea';

import {
  addCashLedgerEntryAction,
  getUnitMembersAction,
  type UnitMember,
} from '../_lib/cash-ledger-actions';

const BILL_TYPES = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'water', label: 'Water' },
  { value: 'other_charges', label: 'Other Charges' },
  { value: 'sinking_fund', label: 'Sinking Fund' },
];

const Schema = z
  .object({
    unit_id: z.string().min(1, 'Unit is required'),
    entry_type: z.enum(['due', 'advance_payment']),
    bill_type: z.string().min(1, 'Bill type is required'),
    amount: z.coerce.number().positive('Amount must be greater than 0'),
    paid_by_type: z.enum(['owner', 'tenant', 'other']),
    paid_by_custom_name: z.string().optional(),
    entry_date: z.string().min(1, 'Date is required'),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.entry_type === 'advance_payment' &&
      data.paid_by_type === 'other' &&
      !data.paid_by_custom_name?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Name is required when selecting Other',
        path: ['paid_by_custom_name'],
      });
    }
  });

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  associationId: string;
  units: { id: string; unit_no: string }[];
  defaultUnitId?: string;
  onSuccess: () => void;
}

export function AddCashLedgerEntryDialog({
  open,
  onOpenChange,
  associationId,
  units,
  defaultUnitId,
  onSuccess,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [members, setMembers] = useState<UnitMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const form = useForm({
    resolver: zodResolver(Schema),
    defaultValues: {
      unit_id: defaultUnitId ?? '',
      entry_type: 'due' as const,
      bill_type: 'maintenance',
      amount: undefined as unknown as number,
      paid_by_type: 'owner' as const,
      paid_by_custom_name: '',
      entry_date: new Date().toISOString().slice(0, 10),
      notes: '',
    },
  });

  // Reset form to clean state whenever dialog is closed.
  useEffect(() => {
    if (!open) {
      form.reset({
        unit_id: defaultUnitId ?? '',
        entry_type: 'due',
        bill_type: 'maintenance',
        amount: undefined as unknown as number,
        paid_by_type: 'owner',
        paid_by_custom_name: '',
        entry_date: new Date().toISOString().slice(0, 10),
        notes: '',
      });
    }
  }, [open, defaultUnitId, form]);

  const selectedUnitId = useWatch({ control: form.control, name: 'unit_id' });
  const entryType = useWatch({ control: form.control, name: 'entry_type' });
  const paidByType = useWatch({ control: form.control, name: 'paid_by_type' });

  const isDue = entryType === 'due';

  // Reload owner/tenant whenever the selected unit changes.
  // The `ignore` flag prevents a stale fetch from overwriting a newer one.
  useEffect(() => {
    if (!selectedUnitId) {
      setMembers([]);
      return;
    }
    let ignore = false;
    setMembersLoading(true);
    getUnitMembersAction(associationId, selectedUnitId)
      .then((res) => {
        if (ignore) return;
        const list = res.members ?? [];
        setMembers(list);
        const hasOwner = list.some((m) => m.role === 'owner');
        const hasTenant = list.some((m) => m.role === 'tenant');
        const current = form.getValues('paid_by_type');
        if (current === 'owner' && !hasOwner) {
          form.setValue('paid_by_type', hasTenant ? 'tenant' : 'other');
        } else if (current === 'tenant' && !hasTenant) {
          form.setValue('paid_by_type', hasOwner ? 'owner' : 'other');
        }
      })
      .finally(() => {
        if (!ignore) setMembersLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [selectedUnitId, associationId, form]);

  const ownerMember = members.find((m) => m.role === 'owner');
  const tenantMember = members.find((m) => m.role === 'tenant');

  function paidByLabel(type: string) {
    if (type === 'owner')
      return ownerMember ? `Owner — ${ownerMember.name}` : 'Owner';
    if (type === 'tenant')
      return tenantMember ? `Tenant — ${tenantMember.name}` : 'Tenant';
    return 'Other';
  }

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      let paid_by_user_id: string | null = null;
      let paid_by_name = '';

      if (!isDue) {
        if (values.paid_by_type === 'owner') {
          paid_by_user_id = ownerMember?.userId ?? null;
          paid_by_name = ownerMember?.name ?? 'Owner';
        } else if (values.paid_by_type === 'tenant') {
          paid_by_user_id = tenantMember?.userId ?? null;
          paid_by_name = tenantMember?.name ?? 'Tenant';
        } else {
          paid_by_name = values.paid_by_custom_name?.trim() ?? '';
        }
      }

      const result = await addCashLedgerEntryAction(associationId, {
        unit_id: values.unit_id,
        entry_type: values.entry_type,
        bill_type: values.bill_type,
        amount: values.amount,
        paid_by_user_id,
        paid_by_name,
        entry_date: values.entry_date,
        notes: values.notes,
      });

      if (result.success) {
        toast.success(isDue ? 'Due recorded' : 'Advance payment recorded');
        form.reset({
          unit_id: defaultUnitId ?? '',
          entry_type: 'due',
          bill_type: 'maintenance',
          amount: undefined as unknown as number,
          paid_by_type: 'owner',
          paid_by_custom_name: '',
          entry_date: new Date().toISOString().slice(0, 10),
          notes: '',
        });
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error(result.error ?? 'Failed to add entry');
      }
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Cash Ledger Entry</DialogTitle>
          <DialogDescription>
            {isDue
              ? 'Record an amount owed by a unit — no payment has been made yet.'
              : 'Log a payment received in advance before a bill is generated.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            {/* Unit */}
            <FormField
              control={form.control}
              name="unit_id"
              render={({ field }) => {
                const selectedUnit = units.find((u) => u.id === field.value);
                return (
                  <FormItem>
                    <FormLabel>Unit</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <span className="truncate">
                            {selectedUnit
                              ? `Unit ${selectedUnit.unit_no}`
                              : 'Select unit'}
                          </span>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {units.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            Unit {u.unit_no}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            {/* Type */}
            <FormField
              control={form.control}
              name="entry_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <span className="truncate">
                          {field.value === 'due' ? 'Due' : 'Advance Payment'}
                        </span>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="due">Due</SelectItem>
                      <SelectItem value="advance_payment">
                        Advance Payment
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Bill Type */}
            <FormField
              control={form.control}
              name="bill_type"
              render={({ field }) => {
                const selected = BILL_TYPES.find(
                  (bt) => bt.value === field.value,
                );
                return (
                  <FormItem>
                    <FormLabel>Bill Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <span className="truncate">
                            {selected?.label ?? field.value}
                          </span>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {BILL_TYPES.map((bt) => (
                          <SelectItem key={bt.value} value={bt.value}>
                            {bt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            {/* Amount */}
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount (₹)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      {...field}
                      value={!field.value ? '' : (field.value as number)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Paid By — only for advance payments */}
            {!isDue && (
              <>
                <FormField
                  control={form.control}
                  name="paid_by_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Paid By</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger disabled={membersLoading}>
                            <span className="truncate">
                              {membersLoading
                                ? 'Loading…'
                                : paidByLabel(field.value)}
                            </span>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(ownerMember ?? paidByType === 'owner') && (
                            <SelectItem value="owner">
                              {paidByLabel('owner')}
                            </SelectItem>
                          )}
                          {(tenantMember ?? paidByType === 'tenant') && (
                            <SelectItem value="tenant">
                              {paidByLabel('tenant')}
                            </SelectItem>
                          )}
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Custom name — only when Other */}
                {paidByType === 'other' && (
                  <FormField
                    control={form.control}
                    name="paid_by_custom_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payer Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter payer name"
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </>
            )}

            {/* Date — label changes by type */}
            <FormField
              control={form.control}
              name="entry_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{isDue ? 'Due Date' : 'Paid On'}</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder={
                        isDue
                          ? 'e.g. Q1 arrears, per AGM decision…'
                          : 'e.g. Cheque #4521, UPI ref XXXXXX…'
                      }
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner className="mr-2" />}
              {isDue ? 'Record Due' : 'Record Payment'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
