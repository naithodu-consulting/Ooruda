'use client';

import { useState, useTransition } from 'react';

import { format } from 'date-fns';
import {
  ChevronDown,
  FileDown,
  FileText,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@kit/ui/alert-dialog';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card } from '@kit/ui/card';
import { DatePicker } from '@kit/ui/date-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';
import { cn } from '@kit/ui/utils';

import { formatINR } from '~/lib/format-inr';

import { deleteExpenseAction } from '../_lib/server/expense-actions';
import { AddExpenseDialog } from './add-expense-dialog';
import { EditExpenseDialog } from './edit-expense-dialog';
import type { ExpenseRow } from './expenses-page-client';

const DATE_PRESETS = [
  { label: 'This Month', value: 'this_month' },
  { label: 'Last Month', value: 'last_month' },
  { label: 'This Quarter', value: 'this_quarter' },
  { label: 'This FY', value: 'this_fy' },
  { label: 'All Time', value: 'all' },
  { label: 'Custom Range', value: 'custom' },
] as const;

type DatePresetValue = (typeof DATE_PRESETS)[number]['value'];

function getDateRange(preset: string): { from: string; to: string } | null {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  if (preset === 'this_month') {
    return {
      from: format(new Date(y, m, 1), 'yyyy-MM-dd'),
      to: format(new Date(y, m + 1, 0), 'yyyy-MM-dd'),
    };
  }
  if (preset === 'last_month') {
    return {
      from: format(new Date(y, m - 1, 1), 'yyyy-MM-dd'),
      to: format(new Date(y, m, 0), 'yyyy-MM-dd'),
    };
  }
  if (preset === 'this_quarter') {
    const qStart = Math.floor(m / 3) * 3;
    return {
      from: format(new Date(y, qStart, 1), 'yyyy-MM-dd'),
      to: format(new Date(y, qStart + 3, 0), 'yyyy-MM-dd'),
    };
  }
  if (preset === 'this_fy') {
    const fyStart = m >= 3 ? y : y - 1;
    return {
      from: `${fyStart}-04-01`,
      to: `${fyStart + 1}-03-31`,
    };
  }
  return null; // 'all' and 'custom' - caller handles custom separately
}

function formatDate(d: string) {
  return format(new Date(d + 'T00:00:00'), 'd MMM yyyy');
}

interface Props {
  associationId: string;
  accountSlug: string;
  initialExpenses: ExpenseRow[];
  totalCount: number;
  categories: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
}

export function ExpenseList({
  associationId,
  initialExpenses,
  categories,
  vendors,
}: Props) {
  const [expenses, setExpenses] = useState<ExpenseRow[]>(initialExpenses);
  const [search, setSearch] = useState('');
  const [datePreset, setDatePreset] = useState<DatePresetValue>('this_fy');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<ExpenseRow | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [, startTransition] = useTransition();

  const { execute: deleteExpense, isPending: deleting } = useAction(
    deleteExpenseAction,
    {
      onSuccess: () => toast.success('Expense deleted.'),
      onError: ({ error }) =>
        toast.error(error.serverError ?? 'Failed to delete expense.'),
    },
  );

  function handleExpenseAdded(expense: ExpenseRow) {
    setExpenses((prev) => [expense, ...prev]);
  }

  function handleExpenseUpdated(updated: ExpenseRow) {
    setExpenses((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }

  function confirmDelete() {
    startTransition(() => {
      selectedIds.forEach((id) => {
        const expense = expenses.find((e) => e.id === id);
        deleteExpense({ id, associationId, title: expense?.title });
      });
      setExpenses((prev) => prev.filter((e) => !selectedIds.has(e.id)));
      setSelectedIds(new Set());
      setDeleteConfirmOpen(false);
    });
  }

  function exportCsv() {
    const rows = [
      [
        'Date',
        'Title',
        'Category',
        'Payee',
        'Mode',
        'Amount',
        'GST',
        'Reference',
        'Invoice',
        'Notes',
      ],
      ...filteredExpenses.map((e) => [
        e.date_of_payment,
        e.title,
        e.category?.name ?? '',
        e.payee_name,
        e.mode_of_payment,
        e.amount,
        e.gst_amount ?? '',
        e.reference_number ?? '',
        e.invoice_number ?? '',
        e.notes ?? '',
      ]),
    ];
    const csv = rows
      .map((r) =>
        r
          .map(String)
          .map((v) => `"${v.replace(/"/g, '""')}"`)
          .join(','),
      )
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportPdf() {
    setExportingPdf(true);
    toast.info('Generating PDF, please wait…');
    try {
      const presetLabel =
        DATE_PRESETS.find((p) => p.value === datePreset)?.label ?? '';
      const filterLabel =
        datePreset === 'custom' && customFrom && customTo
          ? `${filteredExpenses.length} entries · ${customFrom} to ${customTo}`
          : `${filteredExpenses.length} entries · ${presetLabel}`;

      const res = await fetch('/api/expenses/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          associationId,
          from: dateRange?.from,
          to: dateRange?.to,
          categoryId: categoryFilter || undefined,
          mode: modeFilter || undefined,
          search: search || undefined,
          filterLabel,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error ?? 'Failed to generate PDF.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expenses-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to generate PDF.');
    } finally {
      setExportingPdf(false);
    }
  }

  const dateRange =
    datePreset === 'custom'
      ? customFrom && customTo
        ? { from: customFrom, to: customTo }
        : null
      : getDateRange(datePreset);

  const filteredExpenses = expenses.filter((e) => {
    if (dateRange) {
      if (
        e.date_of_payment < dateRange.from ||
        e.date_of_payment > dateRange.to
      )
        return false;
    }
    if (categoryFilter && e.category?.id !== categoryFilter) return false;
    if (modeFilter && e.mode_of_payment !== modeFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (
        !e.title.toLowerCase().includes(s) &&
        !e.payee_name.toLowerCase().includes(s) &&
        !(e.reference_number ?? '').toLowerCase().includes(s) &&
        !(e.invoice_number ?? '').toLowerCase().includes(s)
      ) {
        return false;
      }
    }
    return true;
  });

  const totalAmount = filteredExpenses.reduce(
    (sum, e) => sum + Number(e.amount ?? 0),
    0,
  );

  return (
    <div className={'flex flex-col gap-y-4'}>
      {/* Toolbar */}
      <div
        className={
          'flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'
        }
      >
        <div className={'flex flex-wrap gap-2'}>
          {/* Date preset */}
          <Select
            value={datePreset}
            onValueChange={(v) => setDatePreset(v as DatePresetValue)}
          >
            <SelectTrigger
              className={'w-full sm:w-36'}
              data-test={'date-preset-select'}
            >
              <SelectValue>
                {DATE_PRESETS.find((p) => p.value === datePreset)?.label ??
                  'This FY'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Custom date range inputs */}
          {datePreset === 'custom' && (
            <>
              <DatePicker
                className={'w-full sm:w-40'}
                value={customFrom}
                onChange={setCustomFrom}
                placeholder={'From'}
                clearable
                data-test={'custom-date-from'}
              />
              <DatePicker
                className={'w-full sm:w-40'}
                value={customTo}
                min={customFrom}
                onChange={setCustomTo}
                placeholder={'To'}
                clearable
                data-test={'custom-date-to'}
              />
            </>
          )}

          {/* Category filter */}
          <SearchableSelect
            value={categoryFilter}
            onChange={setCategoryFilter}
            items={[
              { value: '', label: 'All Categories' },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
            placeholder="All Categories"
            searchPlaceholder="Search categories…"
            emptyMessage="No categories found"
            className={'w-full sm:w-44'}
            data-test={'category-filter-select'}
          />

          {/* Mode filter */}
          <Select
            value={modeFilter}
            onValueChange={(v) => setModeFilter(v ?? '')}
          >
            <SelectTrigger
              className={'w-full sm:w-44'}
              data-test={'mode-filter-select'}
            >
              <SelectValue placeholder={'All Modes'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={''}>All Modes</SelectItem>
              {[
                'Cash',
                'UPI',
                'NEFT/RTGS/IMPS',
                'Cheque',
                'Demand Draft',
                'Credit Card',
                'Debit Card',
                'NetBanking',
              ].map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Search */}
          <div className={'relative w-full sm:w-52'}>
            <Search
              className={
                'text-muted-foreground absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2'
              }
            />
            <Input
              className={'w-full pl-8'}
              placeholder={'Search expenses…'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-test={'expense-search-input'}
            />
          </div>
        </div>

        <div className={'flex flex-wrap gap-2'}>
          {selectedIds.size > 0 && (
            <Button
              variant={'destructive'}
              size={'sm'}
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={deleting}
              data-test={'delete-selected-btn'}
            >
              <Trash2 className={'mr-1.5 h-3.5 w-3.5'} />
              Delete ({selectedIds.size})
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant={'outline'}
                  size={'sm'}
                  data-test={'export-menu-btn'}
                >
                  <FileDown className={'mr-1.5 h-3.5 w-3.5'} />
                  Export
                  <ChevronDown className={'ml-1 h-3 w-3'} />
                </Button>
              }
            />
            <DropdownMenuContent align={'end'}>
              <DropdownMenuItem
                onClick={exportCsv}
                data-test={'export-csv-btn'}
              >
                <FileDown className={'mr-2 h-3.5 w-3.5'} />
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={exportPdf}
                disabled={exportingPdf}
                data-test={'export-pdf-btn'}
              >
                {exportingPdf ? (
                  <Loader2 className={'mr-2 h-3.5 w-3.5 animate-spin'} />
                ) : (
                  <FileText className={'mr-2 h-3.5 w-3.5'} />
                )}
                {exportingPdf ? 'Generating PDF…' : 'Export PDF'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size={'sm'}
            onClick={() => setAddOpen(true)}
            data-test={'add-expense-btn'}
          >
            <Plus className={'mr-1.5 h-3.5 w-3.5'} />
            Add Expense
          </Button>
        </div>
      </div>

      {/* Summary row */}
      {filteredExpenses.length > 0 && (
        <div
          className={'text-muted-foreground flex items-center gap-x-4 text-sm'}
        >
          <span>{filteredExpenses.length} entries</span>
          <span className={'text-foreground font-semibold'}>
            {formatINR(totalAmount)}
          </span>
        </div>
      )}

      {/* Table */}
      <Card className={'overflow-hidden'}>
        <div className={'overflow-x-auto'}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={'w-8'}>
                  <input
                    type={'checkbox'}
                    className={'rounded border'}
                    checked={
                      selectedIds.size === filteredExpenses.length &&
                      filteredExpenses.length > 0
                    }
                    onChange={(e) => {
                      if (e.target.checked)
                        setSelectedIds(
                          new Set(filteredExpenses.map((x) => x.id)),
                        );
                      else setSelectedIds(new Set());
                    }}
                    data-test={'select-all-checkbox'}
                  />
                </TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Payee</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className={'text-right'}>Amount</TableHead>
                <TableHead className={'w-16'}></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExpenses.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className={
                      'text-muted-foreground py-12 text-center text-sm'
                    }
                  >
                    No expenses found. Add your first expense to get started.
                  </TableCell>
                </TableRow>
              ) : (
                filteredExpenses.map((expense) => (
                  <TableRow
                    key={expense.id}
                    className={cn(selectedIds.has(expense.id) && 'bg-muted/40')}
                    data-test={'expense-row'}
                  >
                    <TableCell>
                      <input
                        type={'checkbox'}
                        className={'rounded border'}
                        checked={selectedIds.has(expense.id)}
                        onChange={(e) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(expense.id);
                            else next.delete(expense.id);
                            return next;
                          });
                        }}
                      />
                    </TableCell>
                    <TableCell className={'text-sm whitespace-nowrap'}>
                      {formatDate(expense.date_of_payment)}
                    </TableCell>
                    <TableCell>
                      <div className={'text-sm font-medium'}>
                        {expense.title}
                      </div>
                      <div
                        className={'mt-0.5 flex flex-wrap items-center gap-1'}
                      >
                        {expense.reference_number && (
                          <span className={'text-muted-foreground text-xs'}>
                            Ref: {expense.reference_number}
                          </span>
                        )}
                        {expense.recurring && (
                          <Badge variant={'outline'} className={'text-xs'}>
                            Recurring
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {expense.category ? (
                        <Badge variant={'secondary'} className={'text-xs'}>
                          {expense.category.name}
                        </Badge>
                      ) : (
                        <span className={'text-muted-foreground text-xs'}>
                          -
                        </span>
                      )}
                    </TableCell>
                    <TableCell className={'text-sm'}>
                      {expense.payee_name}
                    </TableCell>
                    <TableCell>
                      <span className={'text-muted-foreground text-xs'}>
                        {expense.mode_of_payment}
                      </span>
                    </TableCell>
                    <TableCell
                      className={'text-right text-sm font-medium tabular-nums'}
                    >
                      {formatINR(expense.amount)}
                      {expense.gst_amount ? (
                        <div className={'text-muted-foreground text-xs'}>
                          +{formatINR(expense.gst_amount)} GST
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className={'flex items-center gap-1'}>
                        <Button
                          variant={'ghost'}
                          size={'icon'}
                          className={'h-7 w-7'}
                          onClick={() => setEditExpense(expense)}
                          title={'Edit expense'}
                          data-test={'edit-expense-btn'}
                        >
                          <Pencil className={'h-3.5 w-3.5'} />
                        </Button>
                        {expense.attachment_url && (
                          <a
                            href={expense.attachment_url}
                            target={'_blank'}
                            rel={'noreferrer'}
                            className={
                              'text-muted-foreground hover:text-foreground'
                            }
                            title={'View attachment'}
                            data-test={'attachment-link'}
                          >
                            <Paperclip className={'h-3.5 w-3.5'} />
                          </a>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <AddExpenseDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        associationId={associationId}
        categories={categories}
        vendors={vendors}
        onSuccess={handleExpenseAdded}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className={'bg-card'}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expenses</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedIds.size === 1
                ? 'Are you sure you want to delete this expense? This action cannot be undone.'
                : `Are you sure you want to delete ${selectedIds.size} expenses? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className={'flex justify-end gap-2 pt-2'}>
            <AlertDialogCancel data-test={'delete-cancel-btn'}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant={'destructive'}
              onClick={confirmDelete}
              data-test={'delete-confirm-btn'}
            >
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {editExpense && (
        <EditExpenseDialog
          open={true}
          onClose={() => setEditExpense(null)}
          associationId={associationId}
          expense={editExpense}
          categories={categories}
          vendors={vendors}
          onSuccess={(updated) => {
            handleExpenseUpdated(updated);
            setEditExpense(null);
          }}
        />
      )}
    </div>
  );
}
