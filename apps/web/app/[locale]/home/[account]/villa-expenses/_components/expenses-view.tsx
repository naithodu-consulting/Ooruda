'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { type Resolver, useForm } from 'react-hook-form';

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
import { Textarea } from '@kit/ui/textarea';

import { RupeeInput } from '~/components/rupee-input';
import { todayInBillingZone } from '~/lib/billing-dates';
import { formatDateReadable } from '~/lib/format-date';
import { formatINR } from '~/lib/format-inr';

import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_MODES,
  type ExpenseInput,
  ExpenseSchema,
} from '../_lib/schemas/villa-expenses.schema';
import {
  deleteVillaExpenseAction,
  saveVillaExpenseAction,
} from '../_lib/server/villa-expenses-actions';

interface Expense {
  id: string;
  category: string;
  description: string;
  vendor: string | null;
  amount: number;
  gstAmount: number;
  mode: string;
  spentOn: string;
  invoiceNo: string | null;
  notes: string | null;
}

const MODE_LABELS: Record<(typeof EXPENSE_MODES)[number], string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank: 'Bank transfer',
  card: 'Card',
  other: 'Other',
};

const categoryLabel = (c: string) =>
  EXPENSE_CATEGORY_LABELS[c as keyof typeof EXPENSE_CATEGORY_LABELS] ?? c;

const sumPaise = (xs: number[]) =>
  xs.reduce((s, x) => s + Math.round(x * 100), 0) / 100;

export function ExpensesView(props: {
  accountId: string;
  propertyId: string;
  isOwner: boolean;
  defaultDate: string;
  expenses: Expense[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  // Deleted here: hidden at once, whether or not the page refresh lands.
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const expenses = props.expenses.filter((e) => !deleted.has(e.id));

  const total = sumPaise(expenses.map((e) => e.amount));
  const gst = sumPaise(expenses.map((e) => e.gstAmount));

  const byCategory = Object.entries(
    expenses.reduce<Record<string, number[]>>((acc, e) => {
      (acc[e.category] ??= []).push(e.amount);
      return acc;
    }, {}),
  )
    .map(([c, xs]) => [c, sumPaise(xs)] as const)
    .sort((a, b) => b[1] - a[1]);

  const del = useAction(deleteVillaExpenseAction, {
    onSuccess: ({ input }) => {
      setDeleted((prev) => new Set(prev).add(input.id));
      toast.success('Expense deleted');
      router.refresh();
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not delete the expense.'),
  });

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="bg-card" data-test={'villa-expenses-total'}>
          <CardContent className="flex flex-col gap-1 px-4 py-3">
            <span className="text-muted-foreground text-xs">Spent</span>
            <span className="text-lg font-semibold tabular-nums">
              {formatINR(total)}
            </span>
          </CardContent>
        </Card>
        <Card className="bg-card" data-test={'villa-expenses-gst'}>
          <CardContent className="flex flex-col gap-1 px-4 py-3">
            <span className="text-muted-foreground text-xs">GST paid</span>
            <span className="text-lg font-semibold tabular-nums">
              {formatINR(gst)}
            </span>
          </CardContent>
        </Card>
        <div className="col-span-2 flex items-center sm:col-span-1 sm:justify-end">
          <Button
            className="w-full sm:w-auto"
            onClick={() => setEditing('new')}
            data-test={'villa-expense-add'}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add expense
          </Button>
        </div>
      </div>

      {byCategory.length > 0 ? (
        <ul
          className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs"
          aria-label="By category"
        >
          {byCategory.map(([c, amount]) => (
            <li key={c}>
              {categoryLabel(c)}:{' '}
              <span className="text-foreground tabular-nums">
                {formatINR(amount)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {expenses.length === 0 ? (
        <Card className="bg-card">
          <CardContent
            className="text-muted-foreground py-10 text-center text-sm"
            data-test={'villa-expenses-empty'}
          >
            No expenses recorded this month.
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card overflow-hidden">
          <ul
            className="divide-border divide-y"
            data-test={'villa-expenses-list'}
          >
            {expenses.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
                data-test={'villa-expense-row'}
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {e.description}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {formatDateReadable(e.spentOn)} ·{' '}
                    {categoryLabel(e.category)}
                    {e.vendor ? ` · ${e.vendor}` : ''}
                    {e.invoiceNo ? ` · Bill ${e.invoiceNo}` : ''}
                  </span>
                </div>
                <span className="text-sm font-semibold whitespace-nowrap tabular-nums">
                  {formatINR(e.amount)}
                </span>
                <span className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Edit expense"
                    onClick={() => setEditing(e)}
                    data-test={'villa-expense-edit'}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {props.isOwner ? (
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Delete expense"
                            data-test={'villa-expense-delete'}
                          />
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Delete this expense?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {e.description}, {formatINR(e.amount)}. This cannot
                            be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                          <AlertDialogCancel
                            data-test={'villa-expense-delete-cancel'}
                          >
                            Keep
                          </AlertDialogCancel>
                          <Button
                            variant="destructive"
                            disabled={del.isPending}
                            onClick={() =>
                              del.execute({
                                accountId: props.accountId,
                                id: e.id,
                              })
                            }
                            data-test={'villa-expense-delete-confirm'}
                          >
                            Delete
                          </Button>
                        </div>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {editing ? (
        <ExpenseDialog
          accountId={props.accountId}
          propertyId={props.propertyId}
          defaultDate={props.defaultDate}
          expense={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function ExpenseDialog(props: {
  accountId: string;
  propertyId: string;
  defaultDate: string;
  expense: Expense | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = todayInBillingZone();
  const e = props.expense;

  const form = useForm<ExpenseInput>({
    resolver: zodResolver(ExpenseSchema) as Resolver<ExpenseInput>,
    defaultValues: {
      accountId: props.accountId,
      propertyId: props.propertyId,
      id: e?.id ?? '',
      category: (e?.category as ExpenseInput['category']) ?? 'housekeeping',
      description: e?.description ?? '',
      vendor: e?.vendor ?? '',
      amount: e ? String(e.amount) : '',
      gstAmount: e ? String(e.gstAmount) : '0',
      mode: (e?.mode as ExpenseInput['mode']) ?? 'upi',
      spentOn:
        e?.spentOn ?? (props.defaultDate > today ? today : props.defaultDate),
      invoiceNo: e?.invoiceNo ?? '',
      notes: e?.notes ?? '',
    },
  });

  const { execute, isPending } = useAction(saveVillaExpenseAction, {
    onSuccess: () => {
      toast.success(e ? 'Expense updated' : 'Expense added');
      props.onSaved();
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not save the expense.'),
  });

  return (
    <Dialog open onOpenChange={(o) => (!o ? props.onClose() : undefined)}>
      <DialogContent
        className="max-h-[92vh] max-w-lg overflow-y-auto"
        data-test={'villa-expense-dialog'}
      >
        <DialogHeader>
          <DialogTitle>{e ? 'Edit expense' : 'Add expense'}</DialogTitle>
          <DialogDescription>
            What running the villa cost. Used in the profit report.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((v) => execute(v))}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                name="description"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>What for</FormLabel>
                    <FormControl
                      render={
                        <Input
                          {...field}
                          placeholder="e.g. Pool chlorine"
                          data-test={'villa-expense-description'}
                        />
                      }
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                name="category"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger
                          className="w-full"
                          data-test={'villa-expense-category'}
                        >
                          <SelectValue>
                            {(v: string) => categoryLabel(v)}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map((c) => (
                          <SelectItem
                            key={c}
                            value={c}
                            data-test={`villa-expense-category-${c}`}
                          >
                            {EXPENSE_CATEGORY_LABELS[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                name="spentOn"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        max={today}
                        data-test={'villa-expense-date'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                name="amount"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount paid</FormLabel>
                    <FormControl
                      render={
                        <RupeeInput
                          {...field}
                          value={
                            (field.value as string | number | undefined) ?? ''
                          }
                          data-test={'villa-expense-amount'}
                        />
                      }
                    />
                    <FormDescription>Including any GST.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                name="gstAmount"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Of which GST</FormLabel>
                    <FormControl
                      render={
                        <RupeeInput
                          {...field}
                          value={
                            (field.value as string | number | undefined) ?? ''
                          }
                          data-test={'villa-expense-gst'}
                        />
                      }
                    />
                    <FormDescription>
                      0 if there was no GST bill.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                name="mode"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Paid by</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger
                          className="w-full"
                          data-test={'villa-expense-mode'}
                        >
                          <SelectValue>
                            {(v: string) =>
                              MODE_LABELS[v as keyof typeof MODE_LABELS] ?? v
                            }
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {EXPENSE_MODES.map((m) => (
                          <SelectItem
                            key={m}
                            value={m}
                            data-test={`villa-expense-mode-${m}`}
                          >
                            {MODE_LABELS[m]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                name="vendor"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Paid to (optional)</FormLabel>
                    <FormControl
                      render={
                        <Input {...field} data-test={'villa-expense-vendor'} />
                      }
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                name="invoiceNo"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Bill number (optional)</FormLabel>
                    <FormControl
                      render={
                        <Input {...field} data-test={'villa-expense-invoice'} />
                      }
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                name="notes"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl
                      render={
                        <Textarea
                          {...field}
                          rows={2}
                          data-test={'villa-expense-notes'}
                        />
                      }
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Not DialogFooter: its bg-muted band clashes with the dialog. */}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={props.onClose}
                data-test={'villa-expense-cancel'}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                data-test={'villa-expense-submit'}
              >
                {isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
