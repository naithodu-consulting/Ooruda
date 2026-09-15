'use client';

import { useTransition } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { useAction } from 'next-safe-action/hooks';
import { useForm } from 'react-hook-form';

import { Button } from '@kit/ui/button';
import { DatePicker } from '@kit/ui/date-picker';
import {
  Dialog,
  DialogContent,
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
import { SearchableSelect } from '@kit/ui/searchable-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { toast } from '@kit/ui/sonner';
import { Textarea } from '@kit/ui/textarea';

import { todayInBillingZone } from '~/lib/billing-dates';

import {
  ExpenseSchema,
  PAYMENT_MODES,
  type ExpenseInput,
} from '../_lib/schemas/expense.schema';
import { createExpenseAction } from '../_lib/server/expense-actions';
import type { ExpenseRow } from './expenses-page-client';

interface Props {
  open: boolean;
  onClose: () => void;
  associationId: string;
  categories: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
  onSuccess: (expense: ExpenseRow) => void;
}

export function AddExpenseDialog({
  open,
  onClose,
  associationId,
  categories,
  vendors,
  onSuccess,
}: Props) {
  const [, startTransition] = useTransition();

  const form = useForm({
    resolver: zodResolver(ExpenseSchema),
    defaultValues: {
      associationId,
      payor: 'Association',
      modeOfPayment: 'UPI' as const,
      recurring: false,
      dateOfPayment: format(new Date(), 'yyyy-MM-dd'),
    },
  });

  const { execute, isPending } = useAction(createExpenseAction, {
    onSuccess: ({ data }) => {
      toast.success('Expense added successfully.');
      if (data) {
        // Build a minimal ExpenseRow for optimistic update
        const values = form.getValues() as ExpenseInput;
        const cat = categories.find((c) => c.id === values.categoryId);
        onSuccess({
          id: data.id,
          title: values.title,
          amount: Number(values.amount),
          gst_amount:
            values.gstAmount != null ? Number(values.gstAmount) : null,
          payor: values.payor,
          payee_name: values.payeeName,
          mode_of_payment: values.modeOfPayment,
          reference_number: values.referenceNumber ?? null,
          invoice_number: values.invoiceNumber ?? null,
          date_of_payment: values.dateOfPayment,
          notes: values.notes ?? null,
          recurring: values.recurring,
          attachment_url: values.attachmentUrl ?? null,
          created_at: new Date().toISOString(),
          category: cat ? { id: cat.id, name: cat.name } : null,
        });
      }
      form.reset({
        associationId,
        payor: 'Association',
        modeOfPayment: 'UPI' as const,
        recurring: false,
        dateOfPayment: format(new Date(), 'yyyy-MM-dd'),
      });
      onClose();
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Failed to add expense.'),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function onSubmit(values: any) {
    startTransition(() => execute(values as ExpenseInput));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent
        className={'max-h-[90vh] max-w-lg overflow-y-auto'}
        data-test={'add-expense-dialog'}
      >
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className={'flex flex-col gap-y-4'}
          >
            {/* Title */}
            <FormField
              control={form.control}
              name={'title'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expense Title *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={'e.g. Lift maintenance charge'}
                      {...field}
                      data-test={'expense-title-input'}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className={'grid grid-cols-1 gap-3 sm:grid-cols-2'}>
              {/* Amount */}
              <FormField
                control={form.control}
                name={'amount'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (₹) *</FormLabel>
                    <FormControl>
                      <Input
                        type={'number'}
                        step={'0.01'}
                        min={'0.01'}
                        placeholder={'0.00'}
                        {...field}
                        value={(field.value as number) ?? ''}
                        data-test={'expense-amount-input'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* GST Amount */}
              <FormField
                control={form.control}
                name={'gstAmount'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GST Amount (₹)</FormLabel>
                    <FormControl>
                      <Input
                        type={'number'}
                        step={'0.01'}
                        min={'0'}
                        placeholder={'0.00'}
                        {...field}
                        value={(field.value as number | null) ?? ''}
                        data-test={'expense-gst-input'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Category */}
            <FormField
              control={form.control}
              name={'categoryId'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <FormControl>
                    <SearchableSelect
                      items={categories.map((c) => ({
                        value: c.id,
                        label: c.name,
                      }))}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      placeholder={'Select category'}
                      searchPlaceholder={'Search categories…'}
                      emptyMessage={'No categories found'}
                      className={'w-full'}
                      data-test={'expense-category-select'}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className={'grid grid-cols-1 gap-3 sm:grid-cols-2'}>
              {/* Payor */}
              <FormField
                control={form.control}
                name={'payor'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payor *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={'Association'}
                        {...field}
                        data-test={'expense-payor-input'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Payee Name */}
              <FormField
                control={form.control}
                name={'payeeName'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payee / Vendor *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={'Vendor or person name'}
                        list={'vendor-list'}
                        {...field}
                        data-test={'expense-payee-input'}
                      />
                    </FormControl>
                    <datalist id={'vendor-list'}>
                      {vendors.map((v) => (
                        <option key={v.id} value={v.name} />
                      ))}
                    </datalist>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Mode of Payment */}
            <FormField
              control={form.control}
              name={'modeOfPayment'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mode of Payment *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger
                        className={'w-full'}
                        data-test={'expense-mode-select'}
                      >
                        <SelectValue>
                          {field.value ?? 'Select mode'}
                        </SelectValue>
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

            <div className={'grid grid-cols-1 gap-3 sm:grid-cols-2'}>
              {/* Reference Number */}
              <FormField
                control={form.control}
                name={'referenceNumber'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference No. (optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={'UTR / Cheque no.'}
                        {...field}
                        value={field.value ?? ''}
                        data-test={'expense-ref-input'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Invoice Number */}
              <FormField
                control={form.control}
                name={'invoiceNumber'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invoice No. (optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={'Vendor invoice ref'}
                        {...field}
                        value={field.value ?? ''}
                        data-test={'expense-invoice-input'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Date of Payment */}
            <FormField
              control={form.control}
              name={'dateOfPayment'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date of Payment *</FormLabel>
                  <FormControl>
                    <DatePicker
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      data-test={'expense-date-input'}
                      max={todayInBillingZone()}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name={'notes'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={'Any additional context…'}
                      rows={2}
                      {...field}
                      value={field.value ?? ''}
                      data-test={'expense-notes-input'}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className={'flex flex-wrap justify-end gap-2 pt-2'}>
              <Button
                type={'button'}
                variant={'outline'}
                onClick={onClose}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type={'submit'}
                disabled={isPending}
                data-test={'save-expense-btn'}
              >
                {isPending ? 'Saving…' : 'Save Expense'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
