'use client';

import { useTransition } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useAction } from 'next-safe-action/hooks';
import { useForm } from 'react-hook-form';

import { Button } from '@kit/ui/button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { toast } from '@kit/ui/sonner';
import { Textarea } from '@kit/ui/textarea';

import {
  PAYMENT_MODES,
  UpdateExpenseSchema,
  type UpdateExpenseInput,
} from '../_lib/schemas/expense.schema';
import { updateExpenseAction } from '../_lib/server/expense-actions';
import type { ExpenseRow } from './expenses-page-client';

interface Props {
  open: boolean;
  onClose: () => void;
  associationId: string;
  expense: ExpenseRow;
  categories: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
  onSuccess: (updated: ExpenseRow) => void;
}

export function EditExpenseDialog({
  open,
  onClose,
  associationId,
  expense,
  categories,
  vendors,
  onSuccess,
}: Props) {
  const [, startTransition] = useTransition();

  const form = useForm({
    resolver: zodResolver(UpdateExpenseSchema),
    defaultValues: {
      id: expense.id,
      associationId,
      title: expense.title,
      categoryId: expense.category?.id ?? undefined,
      amount: expense.amount,
      gstAmount: expense.gst_amount ?? undefined,
      payor: expense.payor,
      payeeName: expense.payee_name,
      modeOfPayment: expense.mode_of_payment as (typeof PAYMENT_MODES)[number],
      referenceNumber: expense.reference_number ?? undefined,
      invoiceNumber: expense.invoice_number ?? undefined,
      dateOfPayment: expense.date_of_payment,
      notes: expense.notes ?? undefined,
      recurring: expense.recurring,
    },
  });

  const { execute, isPending } = useAction(updateExpenseAction, {
    onSuccess: () => {
      toast.success('Expense updated successfully.');
      const values = form.getValues();
      const cat = categories.find((c) => c.id === values.categoryId);
      onSuccess({
        ...expense,
        title: values.title ?? expense.title,
        amount: Number(values.amount ?? expense.amount),
        gst_amount: values.gstAmount != null ? Number(values.gstAmount) : null,
        payor: values.payor ?? expense.payor,
        payee_name: values.payeeName ?? expense.payee_name,
        mode_of_payment: values.modeOfPayment ?? expense.mode_of_payment,
        reference_number: values.referenceNumber ?? null,
        invoice_number: values.invoiceNumber ?? null,
        date_of_payment: values.dateOfPayment ?? expense.date_of_payment,
        notes: values.notes ?? null,
        category: cat ? { id: cat.id, name: cat.name } : expense.category,
      });
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Failed to update expense.'),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function onSubmit(values: any) {
    startTransition(() => execute(values as UpdateExpenseInput));
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
        data-test={'edit-expense-dialog'}
      >
        <DialogHeader>
          <DialogTitle>Edit Expense</DialogTitle>
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

            <div className={'grid grid-cols-2 gap-3'}>
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
                        value={(field.value as number | null | undefined) ?? ''}
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
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? ''}
                  >
                    <FormControl>
                      <SelectTrigger
                        className={'w-full'}
                        data-test={'expense-category-select'}
                      >
                        <SelectValue placeholder={'Select category'}>
                          {categories.find((c) => c.id === field.value)?.name ??
                            'Select category'}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className={'grid grid-cols-2 gap-3'}>
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
                        list={'vendor-list-edit'}
                        {...field}
                        data-test={'expense-payee-input'}
                      />
                    </FormControl>
                    <datalist id={'vendor-list-edit'}>
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

            <div className={'grid grid-cols-2 gap-3'}>
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
                    <Input
                      type={'date'}
                      {...field}
                      data-test={'expense-date-input'}
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

            <div className={'flex justify-end gap-2'}>
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
                {isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
