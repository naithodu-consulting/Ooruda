/**
 * Client-side CSV export utilities. All filtering is done in the browser,
 * so we serialize the already-filtered rows directly — no server round-trip.
 */

import type { BillRow } from '~/home/[account]/billing/_lib/billing-queries';
import type { BillPaymentRow } from '~/home/[account]/payments/_components/payments-section';

import { billOutstanding, displayBillStatus } from './bill-status';

/** Escapes a CSV cell value per RFC 4180 (wraps in quotes if needed). */
function cell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(...cells: (string | number | null | undefined)[]): string {
  return cells.map(cell).join(',');
}

function triggerDownload(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Exports the given bill rows as a CSV file.
 * Amounts are raw numbers (no ₹ / commas) for spreadsheet compatibility.
 */
export function exportBillsCsv(
  bills: BillRow[],
  filename = 'bills-export.csv',
) {
  const header = row(
    'bill_no',
    'period',
    'unit_no',
    'bill_type',
    'total_amount',
    'paid_amount',
    'outstanding',
    'gst_amount',
    'status',
    'due_date',
  );

  const lines = bills.map((b) =>
    row(
      b.bill_no,
      b.period,
      b.unit_no,
      b.bill_type,
      b.total_amount,
      b.paid_amount,
      // Advance credit applied to a bill is real settlement — omitting it here
      // reported bills as owing money they had already been settled for.
      billOutstanding(b),
      b.gst_amount ?? '',
      displayBillStatus(b),
      b.due_date,
    ),
  );

  triggerDownload([header, ...lines].join('\r\n'), filename);
}

/**
 * Exports payment rows as a CSV file — one row per individual payment
 * (not per bill), so amounts can be reconciled as ledger entries.
 */
export function exportPaymentsCsv(
  bills: BillPaymentRow[],
  filename = 'payments-export.csv',
) {
  const header = row(
    'bill_no',
    'period',
    'unit_no',
    'bill_type',
    'total_amount',
    'advance_applied',
    'bill_status',
    'payment_date',
    'payment_mode',
    'amount_paid',
    'reference_no',
  );

  const lines: string[] = [];
  for (const b of bills) {
    if (b.payments.length === 0) {
      // Include bills with no payments so the full picture is visible.
      lines.push(
        row(
          b.bill_no,
          b.period,
          b.unit_no,
          b.bill_type,
          b.total_amount,
          b.advance_applied,
          displayBillStatus(b),
          '',
          '',
          '',
          '',
        ),
      );
    } else {
      for (const p of b.payments) {
        lines.push(
          row(
            b.bill_no,
            b.period,
            b.unit_no,
            b.bill_type,
            b.total_amount,
            b.advance_applied,
            displayBillStatus(b),
            p.paid_at ? p.paid_at.slice(0, 10) : '',
            p.mode,
            p.amount,
            p.reference_no ?? '',
          ),
        );
      }
    }
  }

  triggerDownload([header, ...lines].join('\r\n'), filename);
}
