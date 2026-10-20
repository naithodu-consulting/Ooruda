'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { PlusCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { billTypeLabel } from '@kit/pdf-templates/bill-type-labels';
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
import { SearchableSelect } from '@kit/ui/searchable-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@kit/ui/select';

import { formatINR } from '~/lib/format-inr';

import { RazorpayAdvanceCheckoutButton } from './razorpay-advance-checkout';

const BILL_TYPES = [
  'maintenance',
  'electricity',
  'water',
  'other_charges',
  'sinking_fund',
];

const advanceSchema = z.object({
  unitId: z.string().min(1),
  billType: z.string().min(1),
  amount: z
    .number({ message: 'Enter a valid amount' })
    .min(1, 'Minimum amount is ₹1')
    .max(999999, 'Maximum deposit is ₹9,99,999'),
});

type AdvanceFormValues = z.infer<typeof advanceSchema>;

interface UnitOption {
  id: string;
  unit_no: string;
}

interface Props {
  associationId: string;
  units: UnitOption[];
  defaultUnitId?: string;
  defaultBillType?: string;
  canPay: boolean;
}

export function PayAdvanceDialog({
  associationId,
  units,
  defaultUnitId,
  defaultBillType,
  canPay,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const form = useForm<AdvanceFormValues>({
    resolver: zodResolver(advanceSchema),
    defaultValues: {
      unitId: defaultUnitId ?? units[0]?.id ?? '',
      billType: defaultBillType ?? 'maintenance',
      amount: NaN,
    },
    mode: 'onChange',
  });

  const { watch, setValue, reset } = form;
  const unitId = watch('unitId');
  const billType = watch('billType');
  const amount = watch('amount');
  const amountValid = !isNaN(amount) && amount >= 1 && amount <= 999999;
  const selectedUnit = units.find((u) => u.id === unitId);

  function handleSuccess() {
    setOpen(false);
    router.refresh();
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) reset();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant="default"
            size="sm"
            className="gap-1.5 shadow-sm"
            disabled={!canPay}
            data-test="pay-advance-open-dialog"
          >
            <PlusCircle className="h-4 w-4" />
            Add Advance
          </Button>
        }
      />

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Advance Deposit</DialogTitle>
          <DialogDescription>
            Credit will be auto-applied to future bills of the selected type.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <div className="flex flex-col gap-3">
            {units.length > 1 && (
              <FormField
                control={form.control}
                name="unitId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit</FormLabel>
                    <FormControl>
                      <SearchableSelect
                        items={units.map((u) => ({
                          value: u.id,
                          label: `Unit ${u.unit_no}`,
                        }))}
                        value={field.value}
                        onChange={(v) => setValue('unitId', v ?? '')}
                        onBlur={field.onBlur}
                        placeholder="Select unit"
                        searchPlaceholder="Search units…"
                        emptyMessage="No units found"
                        id="advance-unit"
                        data-test="advance-unit-select"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="flex gap-3">
              <FormField
                control={form.control}
                name="billType"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Charge type</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={(v) =>
                          setValue('billType', v ?? 'maintenance')
                        }
                      >
                        <SelectTrigger
                          id="advance-bill-type"
                          data-test="advance-bill-type-select"
                        >
                          <span>{billTypeLabel(billType)}</span>
                        </SelectTrigger>
                        <SelectContent>
                          {BILL_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {billTypeLabel(t)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (₹)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm select-none">
                          ₹
                        </span>
                        <Input
                          id="advance-amount"
                          type="number"
                          min="1"
                          max="999999"
                          step="1"
                          placeholder="0"
                          value={isNaN(field.value) ? '' : field.value}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === ''
                                ? NaN
                                : parseFloat(e.target.value),
                            )
                          }
                          className="w-32 pl-7"
                          data-test="advance-amount-input"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {amountValid && (
              <div className="bg-muted/60 rounded-md px-3 py-2.5 text-sm">
                <span className="text-foreground font-medium">
                  {formatINR(amount)}
                </span>
                <span className="text-muted-foreground">
                  {' '}
                  advance · {billTypeLabel(billType)}
                  {units.length > 1 && selectedUnit
                    ? ` · Unit ${selectedUnit.unit_no}`
                    : ''}
                </span>
              </div>
            )}

            <RazorpayAdvanceCheckoutButton
              associationId={associationId}
              unitId={unitId}
              unitNo={selectedUnit?.unit_no ?? ''}
              billType={billType}
              amount={amountValid ? amount : 0}
              disabled={!amountValid}
              onSuccess={handleSuccess}
            />
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
