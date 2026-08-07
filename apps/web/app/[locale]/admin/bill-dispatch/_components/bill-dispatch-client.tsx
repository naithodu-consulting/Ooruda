'use client';

import { useCallback, useState, useTransition } from 'react';

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  FileText,
  Info,
  Mail,
  Search,
  Send,
  XCircle,
} from 'lucide-react';

import { Alert, AlertDescription } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import { Checkbox } from '@kit/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@kit/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@kit/ui/select';
import { toast } from '@kit/ui/sonner';
import { Spinner } from '@kit/ui/spinner';

import { sendBillEmailsAction } from '../_lib/dispatch-actions';
import {
  DISPATCH_SENDER_EMAIL,
  VALID_BILL_TYPES,
} from '../_lib/dispatch-config';
import type {
  AssociationOption,
  DispatchBillRow,
} from '../_lib/dispatch-queries';
import { fetchBillsForDispatch } from '../_lib/dispatch-queries';

const BILL_TYPES = ['All', ...VALID_BILL_TYPES] as const;

function generatePeriodOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    options.push({ value, label });
  }
  return options;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDueDate(date: string) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

// Normalize DB values like "maintenance", "sinking_fund" → "Maintenance", "Sinking Fund"
function formatBillType(t: string) {
  return t
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Every email claims a PDF is attached, so a row without one cannot be sent.
// Receipts mode requires an actual receipt PDF — never the bill PDF.
function hasPdf(row: DispatchBillRow, mode: 'bills' | 'receipts') {
  return Boolean(mode === 'bills' ? row.pdfUrl : row.receiptPdfUrl);
}

type EmailTarget = 'owner' | 'tenant';

function resolvedEmail(row: DispatchBillRow, target: EmailTarget) {
  return target === 'owner' ? row.ownerEmail : row.tenantEmail;
}

// Why a row can't be sent, or null when it is sendable.
// Note: missing PDFs are no longer a block — dispatch auto-generates them.
function blockReason(
  row: DispatchBillRow,
  mode: 'bills' | 'receipts',
  emailTarget: EmailTarget,
): 'no-email' | 'advance-credit' | null {
  if (!resolvedEmail(row, emailTarget)) return 'no-email';
  // Bills paid via advance credit have no payments row — receipt dispatch not yet supported.
  if (mode === 'receipts' && !row.paymentId) return 'advance-credit';
  return null;
}

interface DispatchResult {
  sent: number;
  failed: { unitNo: string; reason: string }[];
}

interface Props {
  associations: AssociationOption[];
}

export function BillDispatchClient({ associations }: Props) {
  const periodOptions = generatePeriodOptions();

  const [associationId, setAssociationId] = useState('');
  const [mode, setMode] = useState<'bills' | 'receipts'>('bills');
  const [period, setPeriod] = useState(periodOptions[0]?.value ?? '');
  const [billType, setBillType] = useState<string>('All');

  const [rows, setRows] = useState<DispatchBillRow[]>([]);
  const [sortKey, setSortKey] = useState<
    'unitNo' | 'ownerName' | 'tenantName' | null
  >(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Per-row email target: 'owner' (default) or 'tenant'
  const [emailTargets, setEmailTargets] = useState<Record<string, EmailTarget>>(
    {},
  );
  const [hasSearched, setHasSearched] = useState(false);

  const [isFetching, startFetch] = useTransition();
  const [isSending, startSend] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<DispatchResult | null>(
    null,
  );

  const associationName =
    associations.find((a) => a.id === associationId)?.name ?? '';
  const periodLabel =
    periodOptions.find((p) => p.value === period)?.label ?? period;

  const handleSearch = useCallback(() => {
    if (!associationId || !period) return;
    startFetch(async () => {
      const data = await fetchBillsForDispatch({
        associationId,
        mode,
        periods: [period],
        billType,
      });
      // Default to 'owner'; switch to 'tenant' when unit has a tenant but no owner email
      const defaultTargets: Record<string, EmailTarget> = Object.fromEntries(
        data.map((r) => [
          r.billId,
          !r.ownerEmail && r.tenantEmail ? 'tenant' : 'owner',
        ]),
      );
      setRows(data);
      setEmailTargets(defaultTargets);
      setSelectedIds(
        new Set(
          data
            .filter(
              (r) => !blockReason(r, mode, defaultTargets[r.billId] ?? 'owner'),
            )
            .map((r) => r.billId),
        ),
      );
      setHasSearched(true);
      setDispatchResult(null);
    });
  }, [associationId, mode, period, billType]);

  const toggleRow = (billId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(billId)) next.delete(billId);
      else next.add(billId);
      return next;
    });
  };

  const toggleAll = () => {
    const allSelected = sendableRows.every((r) => selectedIds.has(r.billId));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sendableRows.map((r) => r.billId)));
    }
  };

  const getTarget = (billId: string): EmailTarget =>
    emailTargets[billId] ?? 'owner';

  const setTarget = (billId: string, target: EmailTarget) => {
    setEmailTargets((prev) => ({ ...prev, [billId]: target }));
    // If switching target makes the row unblocked/blocked, update selection accordingly
    setSelectedIds((prev) => {
      const row = rows.find((r) => r.billId === billId);
      if (!row) return prev;
      const blocked = blockReason(row, mode, target);
      const next = new Set(prev);
      if (blocked) next.delete(billId);
      else next.add(billId);
      return next;
    });
  };

  const sortedRows = sortKey
    ? [...rows].sort((a, b) => {
        const av = (
          sortKey === 'tenantName' ? (a.tenantName ?? '') : a[sortKey]
        ).toLowerCase();
        const bv = (
          sortKey === 'tenantName' ? (b.tenantName ?? '') : b[sortKey]
        ).toLowerCase();
        const cmp = av.localeCompare(bv, 'en-IN');
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : rows;

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const selectedRows = sortedRows.filter((r) => selectedIds.has(r.billId));
  const sendableRows = sortedRows.filter(
    (r) => !blockReason(r, mode, getTarget(r.billId)),
  );
  const missingEmailRows = sortedRows.filter(
    (r) => blockReason(r, mode, getTarget(r.billId)) === 'no-email',
  );
  const missingReceiptRows = sortedRows.filter(
    (r) => blockReason(r, mode, getTarget(r.billId)) === 'advance-credit',
  );
  const noPdfRows = sortedRows.filter(
    (r) => !blockReason(r, mode, getTarget(r.billId)) && !hasPdf(r, mode),
  );
  const allSendableSelected =
    sendableRows.length > 0 &&
    sendableRows.every((r) => selectedIds.has(r.billId));

  const handleSend = () => {
    if (selectedRows.length === 0) return;
    setConfirmOpen(true);
  };

  const handleConfirmSend = () => {
    setConfirmOpen(false);
    startSend(async () => {
      const result = await sendBillEmailsAction({
        associationName,
        mode,
        items: selectedRows.map((r) => {
          const target = getTarget(r.billId);
          const email = resolvedEmail(r, target)!;
          const name =
            target === 'tenant' && r.tenantName ? r.tenantName : r.ownerName;
          return {
            billId: r.billId,
            paymentId: r.paymentId,
            receiptId: r.receiptId,
            unitNo: r.unitNo,
            recipientName: name,
            recipientEmail: email,
            period: r.period,
            billNo: r.billNo,
            billType: r.billType,
            totalAmount: r.totalAmount,
            paidAmount: r.paidAmount,
            dueDate: r.dueDate,
            pdfUrl: r.pdfUrl,
            receiptPdfUrl: r.receiptPdfUrl,
          };
        }),
      });
      setDispatchResult(result);
      if (result.failed.length === 0) {
        toast.success(
          `${result.sent} email${result.sent !== 1 ? 's' : ''} sent successfully.`,
        );
      } else {
        toast.warning(`${result.sent} sent, ${result.failed.length} failed.`);
      }
    });
  };

  return (
    <div className="space-y-5">
      {/* Filter card */}
      <div className="border-border bg-muted/30 space-y-4 rounded-lg border p-4">
        {/* Segmented mode control */}
        <div
          className="inline-flex overflow-hidden rounded-md text-sm font-semibold"
          style={{ border: '1.5px solid #d1d5db' }}
        >
          {(['bills', 'receipts'] as const).map((m, i) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setRows([]);
                setHasSearched(false);
                setDispatchResult(null);
              }}
              style={i === 0 ? { borderRight: '1px solid #d1d5db' } : {}}
              className={`px-5 py-2 transition-colors ${
                mode === m
                  ? 'bg-[#1a1a1a] text-white'
                  : 'bg-white text-[#555] hover:bg-gray-50'
              }`}
            >
              {m === 'bills' ? 'Send Bills' : 'Send Receipts'}
            </button>
          ))}
        </div>

        {mode === 'receipts' && (
          <p className="flex items-center gap-1.5 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Only bills with <strong>Paid</strong> status appear in Receipt mode.
          </p>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Association — widest */}
          <div className="min-w-[220px] flex-[2]">
            <Select
              value={associationId}
              onValueChange={(v) => {
                if (v) {
                  setAssociationId(v);
                  setRows([]);
                  setHasSearched(false);
                }
              }}
            >
              <SelectTrigger className="w-full bg-white">
                <span className="truncate text-sm">
                  {associationId ? (
                    (associations.find((a) => a.id === associationId)?.name ??
                    associationId)
                  ) : (
                    <span className="text-muted-foreground">
                      Select association…
                    </span>
                  )}
                </span>
              </SelectTrigger>
              <SelectContent>
                {associations.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Period */}
          <div className="min-w-[160px] flex-1">
            <Select value={period} onValueChange={(v) => v && setPeriod(v)}>
              <SelectTrigger className="w-full bg-white">
                <span className="text-sm">
                  {periodLabel || (
                    <span className="text-muted-foreground">Period</span>
                  )}
                </span>
              </SelectTrigger>
              <SelectContent>
                {periodOptions.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bill type */}
          <div className="min-w-[150px] flex-1">
            <Select value={billType} onValueChange={(v) => v && setBillType(v)}>
              <SelectTrigger className="w-full bg-white">
                <span className="text-sm">{billType}</span>
              </SelectTrigger>
              <SelectContent>
                {BILL_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleSearch}
            disabled={!associationId || !period || isFetching}
            className="shrink-0 bg-[#1a1a1a] text-white hover:bg-[#333]"
          >
            {isFetching ? (
              <Spinner className="mr-2 h-4 w-4" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            Load {mode === 'bills' ? 'Bills' : 'Receipts'}
          </Button>
        </div>
      </div>

      {/* Idle state */}
      {!hasSearched && !isFetching && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <FileText className="mb-3 h-8 w-8" style={{ color: '#ccc' }} />
          <p className="text-muted-foreground text-sm font-medium">
            Select an association and period, then click{' '}
            <strong>Load {mode === 'bills' ? 'Bills' : 'Receipts'}</strong>
          </p>
          <p className="mt-1 text-xs" style={{ color: '#aaa' }}>
            Up to 50 records shown. Check individual rows to choose who to send
            to.
          </p>
        </div>
      )}

      {/* Loading */}
      {isFetching && (
        <div className="flex items-center justify-center py-16">
          <Spinner className="text-muted-foreground h-5 w-5" />
          <span className="text-muted-foreground ml-2 text-sm">Loading…</span>
        </div>
      )}

      {/* Results */}
      {hasSearched && !isFetching && (
        <>
          {rows.length === 0 ? (
            <div className="text-muted-foreground rounded-lg border border-dashed py-12 text-center text-sm">
              No {mode === 'bills' ? 'generated bills' : 'paid bills'} found for
              the selected filters.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Summary + send bar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-sm">
                  <span>
                    <strong className="text-foreground">{rows.length}</strong>
                    {rows.length === 50 ? ' (capped at 50)' : ''} record
                    {rows.length !== 1 ? 's' : ''} found
                  </span>
                  {missingEmailRows.length > 0 && (
                    <span
                      className="flex items-center gap-1 text-xs"
                      style={{ color: '#b45309' }}
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {missingEmailRows.length} unit
                      {missingEmailRows.length !== 1 ? 's' : ''} have no email —
                      will be skipped
                    </span>
                  )}
                  {missingReceiptRows.length > 0 && (
                    <span
                      className="flex items-center gap-1 text-xs"
                      style={{ color: '#9ca3af' }}
                    >
                      <Info className="h-3.5 w-3.5" />
                      {missingReceiptRows.length} unit
                      {missingReceiptRows.length !== 1 ? 's' : ''} paid via
                      advance credit — skipped
                    </span>
                  )}
                  {noPdfRows.length > 0 && (
                    <span
                      className="flex items-center gap-1 text-xs"
                      style={{ color: '#6b7280' }}
                      title="PDFs will be auto-generated at send time"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {noPdfRows.length} PDF
                      {noPdfRows.length !== 1 ? 's' : ''} will be generated on
                      send
                    </span>
                  )}
                  <span className="text-muted-foreground text-xs">
                    Sender: <strong>{DISPATCH_SENDER_EMAIL}</strong>
                  </span>
                </div>
                <Button
                  size="sm"
                  disabled={selectedRows.length === 0 || isSending}
                  onClick={handleSend}
                  className="shrink-0 bg-[#1a1a1a] text-white hover:bg-[#333]"
                >
                  {isSending ? (
                    <Spinner className="mr-2 h-4 w-4" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Send
                  {selectedRows.length > 0 ? ` (${selectedRows.length})` : ''}
                </Button>
              </div>

              {/* Table */}
              <div className="border-border overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead
                    className="text-xs font-semibold tracking-wide uppercase"
                    style={{ backgroundColor: '#f4f0e6', color: '#888' }}
                  >
                    <tr>
                      <th className="w-10 px-4 py-3 text-left">
                        <Checkbox
                          checked={allSendableSelected}
                          onCheckedChange={toggleAll}
                        />
                      </th>
                      {(
                        [
                          ['unitNo', 'Unit'],
                          ['ownerName', 'Owner'],
                          ['tenantName', 'Tenant'],
                        ] as const
                      ).map(([key, label]) => (
                        <th key={key} className="px-4 py-3 text-left">
                          <button
                            onClick={() => toggleSort(key)}
                            className="hover:text-foreground flex items-center gap-1 tracking-wide uppercase transition-colors"
                          >
                            {label}
                            {sortKey === key ? (
                              sortDir === 'asc' ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )
                            ) : (
                              <ChevronsUpDown className="h-3 w-3 opacity-40" />
                            )}
                          </button>
                        </th>
                      ))}
                      <th className="px-4 py-3 text-left">Email</th>
                      <th className="px-4 py-3 text-left">Bill No</th>
                      <th className="px-4 py-3 text-left">Type</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-left">Due Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y bg-white">
                    {sortedRows.map((row) => {
                      const blocked = blockReason(
                        row,
                        mode,
                        getTarget(row.billId),
                      );
                      const missing = blocked !== null;
                      const checked = selectedIds.has(row.billId);
                      return (
                        <tr
                          key={row.billId}
                          onClick={() => !missing && toggleRow(row.billId)}
                          style={
                            missing
                              ? {
                                  backgroundColor: '#fffbeb',
                                  cursor: 'not-allowed',
                                  opacity: 0.7,
                                }
                              : checked
                                ? {
                                    backgroundColor: '#fafaf9',
                                    cursor: 'pointer',
                                  }
                                : { cursor: 'pointer' }
                          }
                          className={
                            !missing && !checked ? 'hover:bg-[#fafaf9]' : ''
                          }
                        >
                          <td
                            className="px-4 py-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Checkbox
                              checked={checked}
                              disabled={missing}
                              onCheckedChange={() => toggleRow(row.billId)}
                            />
                          </td>
                          <td
                            className="px-4 py-3 font-semibold"
                            style={{ color: '#1a1a1a' }}
                          >
                            {row.unitNo}
                          </td>
                          <td className="px-4 py-3" style={{ color: '#444' }}>
                            {row.ownerName}
                          </td>
                          <td className="px-4 py-3" style={{ color: '#444' }}>
                            {row.tenantName ?? (
                              <span style={{ color: '#bbb' }}>—</span>
                            )}
                          </td>
                          <td
                            className="px-4 py-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {(() => {
                              const target = getTarget(row.billId);
                              const email = resolvedEmail(row, target);
                              const hasOwnerEmail = Boolean(row.ownerEmail);
                              const hasTenantEmail = Boolean(row.tenantEmail);
                              const showToggle =
                                hasOwnerEmail || hasTenantEmail;
                              return (
                                <div className="space-y-1.5">
                                  {showToggle && (
                                    <div
                                      className="inline-flex w-[116px] overflow-hidden rounded text-[10px] font-semibold"
                                      style={{ border: '1px solid #e5e7eb' }}
                                    >
                                      {(
                                        ['owner', 'tenant'] as EmailTarget[]
                                      ).map((t, i) => {
                                        const hasEmail =
                                          t === 'owner'
                                            ? hasOwnerEmail
                                            : hasTenantEmail;
                                        const isActive = target === t;
                                        return (
                                          <button
                                            key={t}
                                            onClick={() =>
                                              hasEmail &&
                                              setTarget(row.billId, t)
                                            }
                                            disabled={!hasEmail}
                                            style={
                                              i === 0
                                                ? {
                                                    borderRight:
                                                      '1px solid #e5e7eb',
                                                  }
                                                : {}
                                            }
                                            className={`w-[58px] py-0.5 text-center transition-colors ${
                                              isActive
                                                ? 'bg-[#1a1a1a] text-white'
                                                : hasEmail
                                                  ? 'bg-white text-[#888] hover:bg-gray-50'
                                                  : 'cursor-not-allowed bg-white text-[#ccc]'
                                            }`}
                                          >
                                            {t === 'owner' ? 'Owner' : 'Tenant'}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                  {blocked === 'no-email' ? (
                                    <span
                                      className="flex items-center gap-1 text-xs font-medium"
                                      style={{ color: '#b45309' }}
                                    >
                                      <AlertTriangle className="h-3 w-3" />
                                      No email
                                    </span>
                                  ) : (
                                    <span
                                      className="flex items-center gap-1 text-xs"
                                      style={{ color: '#555' }}
                                    >
                                      <Mail
                                        className="h-3 w-3 shrink-0"
                                        style={{ color: '#999' }}
                                      />
                                      <span className="max-w-[160px] truncate">
                                        {email}
                                      </span>
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td
                            className="px-4 py-3 font-mono text-xs"
                            style={{ color: '#666' }}
                          >
                            <span
                              className="block max-w-[180px] truncate"
                              title={row.billNo}
                            >
                              {row.billNo}
                            </span>
                            {!hasPdf(row, mode) && !blocked && (
                              <span
                                className="mt-0.5 flex items-center gap-1 font-sans text-[10px]"
                                style={{ color: '#9ca3af' }}
                                title="PDF will be auto-generated when sending"
                              >
                                <FileText className="h-2.5 w-2.5" />
                                Auto-generate on send
                              </span>
                            )}
                            {blocked === 'advance-credit' && (
                              <span
                                className="mt-1 flex items-center gap-1 font-sans text-xs"
                                style={{ color: '#9ca3af' }}
                                title="Paid via advance credit — receipt dispatch not yet supported"
                              >
                                <Info className="h-2.5 w-2.5" />
                                Advance credit
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3" style={{ color: '#444' }}>
                            {formatBillType(row.billType)}
                          </td>
                          <td
                            className="px-4 py-3 text-right font-semibold tabular-nums"
                            style={{ color: '#1a1a1a' }}
                          >
                            {formatCurrency(row.totalAmount)}
                          </td>
                          <td
                            className="px-4 py-3 text-xs"
                            style={{ color: '#666' }}
                          >
                            {formatDueDate(row.dueDate)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Dispatch result */}
      {dispatchResult && (
        <div className="space-y-2">
          {dispatchResult.sent > 0 && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                {dispatchResult.sent} email
                {dispatchResult.sent !== 1 ? 's' : ''} sent successfully.
              </AlertDescription>
            </Alert>
          )}
          {dispatchResult.failed.length > 0 && (
            <Alert className="border-red-200 bg-red-50">
              <XCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                <p className="mb-1 font-semibold">
                  {dispatchResult.failed.length} failed:
                </p>
                <ul className="space-y-0.5 text-xs">
                  {dispatchResult.failed.map((f, i) => (
                    <li key={i}>
                      Unit {f.unitNo}: {f.reason}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Confirm Email Dispatch</DialogTitle>
            <DialogDescription>
              Review before sending — emails cannot be recalled once sent.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Summary grid */}
            <div
              className="space-y-2 rounded-lg p-4 text-sm"
              style={{ backgroundColor: '#f4f0e6' }}
            >
              {[
                { label: 'Association', value: associationName },
                {
                  label: 'Type',
                  value: mode === 'bills' ? 'Bills' : 'Receipts',
                },
                { label: 'Period', value: periodLabel },
                { label: 'From', value: DISPATCH_SENDER_EMAIL },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="flex items-start justify-between gap-4"
                >
                  <span className="text-muted-foreground shrink-0">
                    {label}
                  </span>
                  <span className="max-w-[320px] text-right font-semibold break-words">
                    {value}
                  </span>
                </div>
              ))}
              <div
                className="mt-1 flex items-center justify-between pt-2"
                style={{ borderTop: '1px solid #e5ddd0' }}
              >
                <span className="text-muted-foreground">Total emails</span>
                <span
                  className="text-base font-bold"
                  style={{ color: '#1a1a1a' }}
                >
                  {selectedRows.length}
                </span>
              </div>
            </div>

            {/* Recipient list */}
            <div className="max-h-52 divide-y overflow-y-auto rounded border text-xs">
              {selectedRows.map((r) => {
                const target = getTarget(r.billId);
                const email = resolvedEmail(r, target);
                const name =
                  target === 'tenant' && r.tenantName
                    ? r.tenantName
                    : r.ownerName;
                return (
                  <div
                    key={r.billId}
                    className="flex items-start justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div
                        className="font-semibold"
                        style={{ color: '#1a1a1a' }}
                      >
                        Unit {r.unitNo}
                      </div>
                      <div className="text-muted-foreground truncate">
                        {name}
                        {target === 'tenant' && (
                          <span
                            className="ml-1 text-[10px]"
                            style={{ color: '#1d4ed8' }}
                          >
                            (tenant)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div style={{ color: '#444' }}>{email}</div>
                      <div className="text-muted-foreground tabular-nums">
                        {formatBillType(r.billType)} ·{' '}
                        {formatCurrency(r.totalAmount)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <p
              className="flex items-center gap-1.5 text-xs font-medium"
              style={{ color: '#b45309' }}
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Emails will be sent immediately and cannot be recalled.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirmSend}
                className="bg-[#1a1a1a] text-white hover:bg-[#333]"
              >
                <Send className="mr-2 h-4 w-4" />
                Confirm & Send
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
