import { notFound } from 'next/navigation';

import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { formatDateReadable } from '~/lib/format-date';
import { formatINR } from '~/lib/format-inr';
import { VILLA_ROLES, requireRole } from '~/lib/rbac';
import { getBooking, getPropertyAddress } from '~/lib/villa-db/bookings';
import { getVillaSite } from '~/lib/villa-db/client';
import { rupeesInWords } from '~/lib/villa/amount-words';
import { selectVillaProperty } from '~/lib/villa/properties';

import { PrintButton } from './print-button';

export const metadata = { title: 'Voucher' };

const UUID = /^[0-9a-f-]{36}$/i;

const MODE: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank: 'Bank transfer',
  card: 'Card',
  other: 'Other',
};

interface Props {
  params: Promise<{
    account: string;
    bookingId: string;
    kind: string;
    id: string;
  }>;
  searchParams: Promise<{ property?: string }>;
}

/**
 * A receipt voucher (money received) or refund voucher (money returned),
 * laid out for printing or saving as PDF. Receipts are not tax invoices: the
 * tax invoice is issued at check-out (plan §9).
 */
export default async function VoucherPage({ params, searchParams }: Props) {
  const [{ account, bookingId, kind, id }, sp] = await Promise.all([
    params,
    searchParams,
  ]);

  if (
    !UUID.test(bookingId) ||
    !UUID.test(id) ||
    !['receipt', 'refund'].includes(kind)
  ) {
    notFound();
  }

  const { accountId } = await requireRole(account, VILLA_ROLES, 'villa');
  const { property } = await selectVillaProperty(accountId, sp.property);
  if (!property) notFound();

  const client = getSupabaseServerClient();
  const site = await getVillaSite(accountId, property.id);

  const [booking, address, business, record] = await Promise.all([
    getBooking(site, bookingId),
    getPropertyAddress(site).catch(() => null),
    client
      .from('villa_properties')
      .select('name, legal_name, gstin')
      .eq('id', property.id)
      .single(),
    kind === 'receipt'
      ? client
          .from('villa_booking_payments')
          .select(
            'receipt_no, amount, mode, paid_on, reference, payer_name, voided_at, void_reason',
          )
          .eq('id', id)
          .eq('property_id', property.id)
          .eq('site_booking_id', bookingId)
          .maybeSingle()
      : client
          .from('villa_refunds')
          .select(
            'refund_no, amount, mode, refunded_on, reference, reason, villa_booking_payments(receipt_no)',
          )
          .eq('id', id)
          .eq('property_id', property.id)
          .eq('site_booking_id', bookingId)
          .maybeSingle(),
  ]);

  if (business.error || record.error) {
    (await getLogger()).error(
      { id, code: (business.error ?? record.error)!.code },
      'villa voucher load failed',
    );
    throw new Error('Could not load the voucher.');
  }

  if (!booking || !record.data) notFound();

  const r = record.data as Record<string, unknown>;
  const isReceipt = kind === 'receipt';
  const number = String(isReceipt ? r.receipt_no : r.refund_no);
  const amount = Number(r.amount);
  const date = String(isReceipt ? r.paid_on : r.refunded_on);
  const voided = isReceipt && Boolean(r.voided_at);
  const againstReceipt = !isReceipt
    ? (
        (Array.isArray(r.villa_booking_payments)
          ? r.villa_booking_payments[0]
          : r.villa_booking_payments) as { receipt_no?: string } | null
      )?.receipt_no
    : null;

  const rows: [string, string][] = [
    [
      isReceipt ? 'Received from' : 'Paid to',
      String(r.payer_name ?? booking.guestName),
    ],
    ['Booking', booking.bookingCode ?? booking.referenceNumber],
    [
      'Stay',
      `${formatDateReadable(booking.checkIn)} to ${formatDateReadable(booking.checkOut)}`,
    ],
    ['Mode', MODE[String(r.mode)] ?? String(r.mode)],
    ...(r.reference
      ? [['Reference', String(r.reference)] as [string, string]]
      : []),
    ...(againstReceipt
      ? [['Against receipt', againstReceipt] as [string, string]]
      : []),
    ...(!isReceipt && r.reason
      ? [['Reason', String(r.reason)] as [string, string]]
      : []),
  ];

  return (
    <div className="bg-background min-h-full p-4 sm:p-8 print:p-0">
      {/* Print the voucher only, without the app around it. */}
      <style>{`@media print {
        [data-sidebar="sidebar"], [data-slot="sidebar-gap"], header { display: none !important; }
        body { background: #fff !important; }
      }`}</style>

      <div className="mx-auto mb-4 flex max-w-2xl justify-end print:hidden">
        <PrintButton />
      </div>

      <article
        className="bg-card relative mx-auto max-w-2xl overflow-hidden rounded-xl border p-6 sm:p-10 print:rounded-none print:border-0"
        data-test={'villa-voucher'}
      >
        {voided ? (
          <div
            className="text-destructive/15 pointer-events-none absolute inset-0 flex items-center justify-center text-8xl font-black tracking-widest select-none"
            aria-hidden
          >
            VOID
          </div>
        ) : null}

        <header className="flex flex-col gap-1 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-lg font-semibold">
              {business.data.legal_name || business.data.name}
            </p>
            {address ? (
              <p className="text-muted-foreground text-sm">{address}</p>
            ) : null}
            {business.data.gstin ? (
              <p className="text-sm">GSTIN: {business.data.gstin}</p>
            ) : null}
          </div>
          <div className="sm:text-right">
            <h1
              className="text-base font-semibold"
              data-test={'villa-voucher-title'}
            >
              {isReceipt ? 'Receipt voucher' : 'Refund voucher'}
            </h1>
            <p className="font-mono text-sm" data-test={'villa-voucher-number'}>
              {number}
            </p>
            <p className="text-muted-foreground text-sm">
              {formatDateReadable(date)}
            </p>
          </div>
        </header>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 py-5 text-sm sm:grid-cols-[10rem_1fr]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="bg-muted/40 rounded-lg p-4">
          <p
            className="text-2xl font-semibold tabular-nums"
            data-test={'villa-voucher-amount'}
          >
            {formatINR(amount)}
          </p>
          <p className="text-sm" data-test={'villa-voucher-words'}>
            {rupeesInWords(amount)}
          </p>
        </div>

        {voided ? (
          <p
            className="text-destructive mt-4 text-sm"
            data-test={'villa-voucher-void'}
          >
            This receipt is void: {String(r.void_reason ?? '')}
          </p>
        ) : null}

        <footer className="text-muted-foreground mt-6 border-t pt-4 text-xs">
          {isReceipt
            ? 'This is a receipt for money received against the booking. It is not a tax invoice; the tax invoice is issued at check-out.'
            : 'This records money returned to the guest against the booking.'}
        </footer>
      </article>
    </div>
  );
}
