'use client';

import { useState, useTransition } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useWatch } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Alert, AlertDescription } from '@kit/ui/alert';
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

import { formatINR } from '~/lib/format-inr';

import { recordDuePaymentAction } from '../../cash-ledger/_lib/cash-ledger-actions';

const PAYMENT_MODES = ['Cash', 'Bank Transfer', 'UPI', 'Cheque'] as const;

const Schema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  mode: z.enum(PAYMENT_MODES),
  paid_by_role: z.enum(['Owner', 'Tenant']),
  reference_no: z.string().optional(),
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  associationId: string;
  unitId: string;
  unitNo: string;
  billType: string;
  outstanding: number;
  hasTenancy: boolean;
  onSuccess: () => void;
}

export function PayDueDialog({
  open,
  onOpenChange,
  associationId,
  unitId,
  unitNo,
  billType,
  outstanding,
  hasTenancy,
  onSuccess,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(Schema),
    defaultValues: {
      amount: outstanding,
      mode: 'Cash',
      paid_by_role: 'Owner' as const,
      reference_no: '',
    },
  });

  const selectedMode = useWatch({ control: form.control, name: 'mode' });

  const onSubmit = form.handleSubmit((values) => {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await recordDuePaymentAction(associationId, {
        unit_id: unitId,
        bill_type: billType,
        amount: values.amount,
        mode: values.mode,
        paid_by_role: values.paid_by_role,
        reference_no: values.reference_no?.trim() || undefined,
      });
      if (result.success) {
        toast.success('Payment recorded successfully');
        form.reset();
        onOpenChange(false);
        onSuccess();
      } else {
        setErrorMessage(
          result.error ?? 'Payment could not be recorded. Please try again.',
        );
      }
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Pay Due - Unit {unitNo} ({billType})
          </DialogTitle>
          <DialogDescription>
            Outstanding: {formatINR(outstanding)}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            {errorMessage && (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}
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
                      {...field}
                      value={field.value as number}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="mode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Mode</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <span className="truncate">
                          {field.value || 'Select mode'}
                        </span>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PAYMENT_MODES.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="paid_by_role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paid by</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-test="paid-by-role-trigger">
                        <span className="truncate">
                          {field.value || 'Select payer'}
                        </span>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem data-test="paid-by-role-owner" value="Owner">
                        Owner
                      </SelectItem>
                      <SelectItem
                        data-test="paid-by-role-tenant"
                        value="Tenant"
                        disabled={!hasTenancy}
                      >
                        Tenant{!hasTenancy ? ' (no active tenant)' : ''}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedMode !== 'Cash' && (
              <FormField
                control={form.control}
                name="reference_no"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference No.</FormLabel>
                    <FormControl>
                      <Input placeholder="UTR / Cheque no." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner className="mr-2" />}
              Record Payment
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
