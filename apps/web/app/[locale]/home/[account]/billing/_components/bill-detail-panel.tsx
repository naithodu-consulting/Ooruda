'use client';

import { useEffect, useState } from 'react';

import { AlertCircle, Download, RotateCw } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Skeleton } from '@kit/ui/skeleton';

import { formatDateDMY, formatTimestampDateDMY } from '~/lib/format-date';
import { formatINR } from '~/lib/format-inr';

import { fetchBillDetailAction } from '../_lib/unit-billing-actions';
import type { BillDetail, UnitBill } from '../_lib/unit-billing-types';

interface Props {
  bill: UnitBill;
  /** Cached detail from the parent, if this bill has been expanded before. */
  detail: BillDetail | null;
  onLoaded: (billId: string, detail: BillDetail) => void;
}

/**
 * The innermost level of the billing tree: the line-item breakdown and payment
 * history for one bill.
 *
 * Detail is fetched the first time a bill is expanded and then handed up to the
 * table for caching, so collapsing and re-expanding is instant.
 */
export function BillDetailPanel({ bill, detail, onLoaded }: Props) {
  const [loading, setLoading] = useState(!detail);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (detail) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchBillDetailAction(bill.id)
      .then((result) => {
        if (cancelled) return;
        if (!result.success || !result.detail) {
          setError(result.error ?? 'Could not load the bill breakdown.');
        } else {
          onLoaded(bill.id, result.detail);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the bill breakdown.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `onLoaded` is stable (useCallback in the parent); re-running on identity
    // changes would refetch on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill.id, detail]);

  if (loading) {
    return (
      <div className="bg-muted/30 space-y-2 border-b px-4 py-3 pl-20">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-muted/30 flex items-center gap-2 border-b px-4 py-3 pl-20 text-xs text-[var(--color-danger)]">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        <span>{error}</span>
        <button
          onClick={() => setError(null)}
          className="inline-flex items-center gap-1 underline underline-offset-2"
        >
          <RotateCw className="h-3 w-3" />
          Retry
        </button>
      </div>
    );
  }

  const lineItems = detail?.lineItems ?? [];
  const payments = detail?.payments ?? [];
  const baseTotal = lineItems.reduce((s, li) => s + li.amount, 0);

  return (
    <div className="bg-muted/30 border-b px-4 py-4 pl-20">
      {/* Action bar: due date + download */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-muted-foreground text-xs">
          Due{' '}
          <span
            className={
              new Date(bill.due_date) < new Date()
                ? 'font-semibold text-[var(--color-danger)]'
                : 'text-foreground font-medium'
            }
          >
            {formatDateDMY(bill.due_date)}
          </span>
        </span>
        <a
          href={`/api/billing/bills/${bill.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors"
        >
          <Download className="h-3 w-3" />
          Download PDF
        </a>
      </div>

      <div className="grid gap-6">
        {/* Line items */}
        <div>
          <div className="text-muted-foreground mb-2 text-[10px] font-bold tracking-wider uppercase">
            Line Items
          </div>

          {lineItems.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              No line items recorded for this bill.
            </p>
          ) : (
            <div className="flex flex-col">
              {lineItems.map((li) => (
                <div
                  key={li.id}
                  className="flex items-baseline justify-between gap-4 border-b py-1.5 text-xs last:border-b-0"
                >
                  <div className="min-w-0">
                    <span className="truncate">{li.description}</span>
                    {li.area_sqft != null && li.rate_per_sqft != null && (
                      <span className="text-muted-foreground ml-1.5 text-[11px]">
                        {li.area_sqft} sqft @ ₹{li.rate_per_sqft}
                      </span>
                    )}
                    {li.gst_applicable && (
                      <Badge
                        variant="outline"
                        className="ml-1.5 px-1 py-0 text-[9px]"
                      >
                        GST
                      </Badge>
                    )}
                    <span className="text-muted-foreground ml-1.5 text-[11px]">
                      · {li.payer}
                    </span>
                  </div>
                  <span className="shrink-0 tabular-nums">
                    {formatINR(li.amount)}
                  </span>
                </div>
              ))}

              {bill.gst_amount != null && bill.gst_amount > 0 && (
                <div className="text-muted-foreground flex items-baseline justify-between gap-4 border-b py-1.5 text-xs">
                  <span>GST</span>
                  <span className="tabular-nums">
                    {formatINR(bill.gst_amount)}
                  </span>
                </div>
              )}

              {bill.advance_applied > 0 && (
                <div className="flex items-baseline justify-between gap-4 border-b py-1.5 text-xs text-[var(--color-info)]">
                  <span>Advance applied</span>
                  <span className="tabular-nums">
                    −{formatINR(bill.advance_applied)}
                  </span>
                </div>
              )}

              <div className="flex items-baseline justify-between gap-4 pt-2 text-xs font-semibold">
                <span>Total</span>
                <span className="tabular-nums">
                  {formatINR(bill.total_amount)}
                </span>
              </div>

              {/* Surfaces a mismatch between the stored total and the sum of its
                parts rather than silently showing a number that doesn't add up. */}
              {Math.abs(
                baseTotal + (bill.gst_amount ?? 0) - bill.total_amount,
              ) > 1 && (
                <p className="text-muted-foreground mt-1 text-[10px]">
                  Line items and total differ — the bill may include
                  adjustments.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Payment history */}
        <div>
          <div className="text-muted-foreground mb-2 text-[10px] font-bold tracking-wider uppercase">
            Payment History
          </div>

          {payments.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              No payments recorded yet.
            </p>
          ) : (
            <div className="flex flex-col">
              {payments.map((p) => {
                const reversed = !!p.reversed_at || p.status === 'Reversed';
                return (
                  <div
                    key={p.id}
                    className="flex items-baseline justify-between gap-4 border-b py-1.5 text-xs last:border-b-0"
                  >
                    <div className="min-w-0">
                      <span className="tabular-nums">
                        {formatTimestampDateDMY(p.paid_at)}
                      </span>
                      <span className="text-muted-foreground ml-1.5">
                        · {p.mode}
                      </span>
                      {p.reference_no && (
                        <span className="text-muted-foreground ml-1.5 font-mono text-[10px]">
                          {p.reference_no}
                        </span>
                      )}
                      {p.receipt_no && (
                        <span className="text-muted-foreground ml-1.5 font-mono text-[10px]">
                          {p.receipt_no}
                        </span>
                      )}
                      {reversed && (
                        <Badge
                          variant="outline"
                          className="ml-1.5 border-[var(--color-danger)]/40 px-1 py-0 text-[9px] text-[var(--color-danger)]"
                        >
                          Reversed
                        </Badge>
                      )}
                    </div>
                    <span
                      className={`shrink-0 tabular-nums ${
                        reversed
                          ? 'text-muted-foreground line-through'
                          : 'text-[var(--color-success)]'
                      }`}
                    >
                      {formatINR(p.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
