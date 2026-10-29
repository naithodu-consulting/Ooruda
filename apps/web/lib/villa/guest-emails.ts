import { formatPhoneNumber } from '@kit/shared/utils';

import { addDays } from '~/lib/villa-db/dates';
import {
  type CancellationOutlook,
  cancellationOutlook,
} from '~/lib/villa/cancellation';

/**
 * Automatic guest emails: WHEN each is due and WHAT it says. Pure (no I/O);
 * the sender (guest-email-runner.ts) re-checks every booking on the booking
 * site right before sending.
 *
 *   booking_confirmation  immediately on booking creation (manual bookings);
 *   pre_arrival           from 10:00 IST the day before check-in, until 3 hours
 *                         before check-in time (a booking made later gets none);
 *   thank_you             3 hours after staff press Check out, for up to 7 days.
 */

export type GuestEmailTemplate =
  | 'booking_confirmation'
  | 'pre_arrival'
  | 'thank_you';

export const GUEST_EMAIL_LABELS: Record<GuestEmailTemplate, string> = {
  booking_confirmation: 'Booking confirmation',
  pre_arrival: 'Before arrival',
  thank_you: 'Thank you (after check-out)',
};

export const DEFAULT_VILLA_SITE_URL = 'https://villa19.in';

/**
 * The operating company behind every villa, and its central guest contacts.
 * These are company-wide facts, so a property that has not filled them in
 * still renders a correct footer.
 *
 * GSTIN is deliberately NOT here. A GSTIN is a per-state registration (the
 * leading digits are the state code), so it belongs to the property, not the
 * company: a villa outside Karnataka must print its own. It is read from
 * villa_properties.gstin and the line is skipped when unset.
 */
export const DEFAULT_VILLA_ENTITY = {
  legalName: 'HABBAA SOLUTIONS PVT LTD',
  legalAddress:
    '209, Citadel Prism, PVS Kalakunj Road, Kodialbail, Mangalore 575003',
  cin: 'U47711KA2025PTC207750',
  supportEmail: 'reservations@habbaa.com',
  whatsApp: '+918050484123',
} as const;

/**
 * Formats the From header display name to match the villa name
 * (e.g. "Villa 19 <reservations@habbaa.com>").
 */
export function formatSenderAddress(
  villaName: string,
  configuredFrom: string,
): string {
  const email =
    /<([^>]+)>/.exec(configuredFrom)?.[1]?.trim() ??
    (configuredFrom.includes('@') ? configuredFrom.trim() : null);

  if (!email) return configuredFrom;
  return `${villaName} <${email}>`;
}

const HOUR = 3_600_000;

/** An India date and time ('YYYY-MM-DD', 'HH:MM') as an instant. */
export function istInstant(ymd: string, hhmm = '00:00'): Date {
  return new Date(`${ymd}T${hhmm}:00+05:30`);
}

export const PRE_ARRIVAL_SEND_TIME = '10:00';
export const PRE_ARRIVAL_LATEST_HOURS_BEFORE = 3;
export const THANK_YOU_DELAY_HOURS = 3;
export const THANK_YOU_WINDOW_DAYS = 7;

export function preArrivalWindow(checkIn: string, checkInTime: string | null) {
  const opens = istInstant(addDays(checkIn, -1), PRE_ARRIVAL_SEND_TIME);
  const closes = new Date(
    istInstant(checkIn, normaliseTime(checkInTime)).getTime() -
      PRE_ARRIVAL_LATEST_HOURS_BEFORE * HOUR,
  );
  return { opens, closes };
}

export function isPreArrivalDue(
  checkIn: string,
  checkInTime: string | null,
  now: Date,
): boolean {
  const { opens, closes } = preArrivalWindow(checkIn, checkInTime);
  return now >= opens && now < closes;
}

export function thankYouWindow(checkedOutAt: Date) {
  return {
    opens: new Date(checkedOutAt.getTime() + THANK_YOU_DELAY_HOURS * HOUR),
    closes: new Date(
      checkedOutAt.getTime() + THANK_YOU_WINDOW_DAYS * 24 * HOUR,
    ),
  };
}

export function isThankYouDue(checkedOutAt: Date, now: Date): boolean {
  const { opens, closes } = thankYouWindow(checkedOutAt);
  return now >= opens && now < closes;
}

/** 'HH:MM' or 'HH:MM:SS' → 'HH:MM'; missing → 14:00 (the site's default). */
function normaliseTime(t: string | null): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t?.trim() ?? '');
  return m && Number(m[1]) < 24 ? `${m[1]!.padStart(2, '0')}:${m[2]}` : '14:00';
}

// ── Content ─────────────────────────────────────────────────────

export interface GuestEmailContext {
  villaName: string;
  guestName: string;
  guestEmail?: string | null;
  /** ISO timestamp of when the booking was created (for "Booked on" row). */
  bookedAt?: string | null;
  bookingCode: string | null;
  checkIn: string;
  checkOut: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  adults: number;
  children?: number;
  guestPhone?: string;
  /** Confirmation-only: amounts in paise (integer). */
  baseAmountPaise?: number;
  extraGuestAmountPaise?: number;
  discountAmountPaise?: number;
  discountCode?: string | null;
  taxAmountPaise?: number;
  totalAmountPaise?: number;
  /** How much has actually been received. For 'paid' = total; 'unpaid' = 0. */
  amountPaidPaise?: number;
  /** 'paid' | 'partially_paid' | 'unpaid' — used for the payment block label. */
  paymentStatus?: string;
  whatsApp: string | null;
  contacts: { name: string; role: string; phone: string }[];
  /** "Urwa, Mangalore, Karnataka" — printed under the villa's name. */
  propertyLocation?: string | null;
  /**
   * Guests above the property's base occupancy, which is what the extra-guest
   * charge is for. Omitted leaves the row unqualified rather than printing "0".
   */
  extraGuests?: number | null;
  /** Shown beside the paid line, e.g. "Razorpay" or "Bank transfer". */
  paymentMethod?: string | null;
  /**
   * When the money actually arrived, as an ISO timestamp or date. Not the
   * booking date: a hand-entered booking is often receipted days later.
   */
  paymentDate?: string | null;
  /** The guest's own confirmation page on the booking site, if we have one. */
  bookingUrl?: string | null;
  /** Booking site origin, for the three policy links. No trailing slash. */
  siteBaseUrl?: string | null;
  /**
   * The operating company behind the villa, for the footer every transactional
   * email needs. Each line is skipped when it is not set.
   */
  legalName?: string | null;
  legalAddress?: string | null;
  cin?: string | null;
  gstin?: string | null;
  /** Where a guest writes to cancel. Falls back to nothing, not to a guess. */
  supportEmail?: string | null;
}

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const longDate = (ymd: string) =>
  istInstant(ymd, '12:00').toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

const shortDate = (ymd: string) =>
  istInstant(ymd, '12:00').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });

const time12 = (t: string | null, fallback: string) => {
  const hhmm = /^\d{1,2}:\d{2}/.test(t?.trim() ?? '')
    ? normaliseTime(t)
    : fallback;
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''} ${suffix}`;
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

const bookedOnFmt = (iso: string): string | null => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
};

/** "13 Oct 2026" — the date beside the paid amount. */
const paidDate = (iso: string): string | null => {
  const d = new Date(iso);

  if (isNaN(d.getTime())) return null;

  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
};

/** Paise to "₹70,092". */
const inrP = (paise: number) =>
  `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

// ── Villa-booking-matching email palette ──────────────────────────────
const MAROON = '#5C1732';
const CREAM = '#f7f3ee';
const CARD = '#fdf9f4';
const RULE = '#e9e0d6';
const INK = '#2e2a28';
const MUTED = '#73685f';
const GREEN = '#2f6b45';
const OK_COLOR = '#2E7D5B';
/** --error, and the amber the partial-refund notice uses. */
const RED = '#B3261E';
const RED_TINT = '#FDF0EF';
const RED_EDGE = '#EFC9C6';
const AMBER = '#8a5a12';
const AMBER_TINT = '#fdf2e3';
const AMBER_EDGE = '#e6cfa8';
const SANS = 'Helvetica,Arial,sans-serif';
const SERIF = "Georgia,'Times New Roman',serif";

// Asset base from villa-booking's publicly hosted files (the success-tick PNG).
const EMAIL_ASSET_BASE = 'https://villa-booking-psi.vercel.app';

/**
 * Who sent this and under which registration - what a transactional email
 * from a registered company carries. Every line is optional: a villa that has
 * not filled in its company details gets no footer at all rather than an
 * empty bar, which is why this returns '' rather than a blank band.
 */
function footerBlock(ctx: GuestEmailContext): string {
  const lines = [
    ctx.legalName ? esc(ctx.legalName) : '',
    ctx.legalAddress ? esc(ctx.legalAddress) : '',
  ].filter(Boolean);

  const ids = [
    ctx.cin ? `CIN: ${esc(ctx.cin)}` : '',
    ctx.gstin ? `GSTIN: ${esc(ctx.gstin)}` : '',
  ].filter(Boolean);

  if (lines.length === 0 && ids.length === 0) return '';

  return `
  <!-- Footer -->
  <tr><td class="pad" style="background:${CREAM};border-top:1px solid ${RULE};padding:22px 36px 26px;text-align:center;">
    ${lines.length ? `<p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.7;color:${MUTED};">${lines.join('<br>')}</p>` : ''}
    ${ids.length ? `<p style="margin:10px 0 0;font-family:${SANS};font-size:12px;line-height:1.7;color:${MUTED};">${ids.join('<br>')}</p>` : ''}
    <p style="margin:12px 0 0;font-family:${SANS};font-size:11px;color:${MUTED};">You are receiving this email because you have booked a stay with us.</p>
  </td></tr>`;
}

function policyLink(url: string, label: string): string {
  return `<a href="${esc(url)}" style="color:${MAROON};font-weight:bold;">${esc(label)}</a>`;
}

function emailRule(): string {
  return `<div style="height:1px;background:${RULE};margin:28px 0;"></div>`;
}

function sectionLabel(text: string): string {
  return `<p style="margin:0 0 12px;font-family:${SANS};font-size:11px;letter-spacing:1.4px;color:${MUTED};text-transform:uppercase;">${esc(text)}</p>`;
}

function detailRow(label: string, value: string, sub?: string): string {
  return `<tr>
    <td style="padding:4px 12px 4px 0;font-family:${SANS};font-size:14px;color:${MUTED};vertical-align:top;width:34%;">${esc(label)}</td>
    <td style="padding:4px 0;font-family:${SANS};font-size:14px;color:${INK};vertical-align:top;">${value}${
      sub
        ? `<br><span style="color:${MUTED};font-size:13px;">${esc(sub)}</span>`
        : ''
    }</td>
  </tr>`;
}

function payRow(label: string, amount: string, credit?: boolean): string {
  return `<tr>
    <td style="padding:4px 0;font-family:${SANS};font-size:14px;color:${INK};">${label}</td>
    <td style="padding:4px 0;font-family:${SANS};font-size:14px;color:${credit ? GREEN : INK};text-align:right;white-space:nowrap;">${esc(amount)}</td>
  </tr>`;
}

function istNoon(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function dateWithWeekday(iso: string): string {
  return istNoon(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

function stayRange(checkIn: string, checkOut: string): string {
  const part = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    istNoon(iso).toLocaleDateString('en-GB', {
      ...opts,
      timeZone: 'Asia/Kolkata',
    });
  const sameMonth =
    part(checkIn, { month: 'short', year: 'numeric' }) ===
    part(checkOut, { month: 'short', year: 'numeric' });
  const from = sameMonth
    ? part(checkIn, { weekday: 'short', day: 'numeric' })
    : `${part(checkIn, { weekday: 'short', day: 'numeric' })} ${part(checkIn, { month: 'short' })}`;
  return `${from} to ${part(checkOut, { weekday: 'short', day: 'numeric' })} ${part(checkOut, { month: 'short', year: 'numeric' })}`;
}

function guestLine(adults: number, children: number): string {
  const parts = [`${adults} ${adults === 1 ? 'adult' : 'adults'}`];
  if (children > 0)
    parts.push(`${children} ${children === 1 ? 'child' : 'children'}`);
  return parts.join(', ');
}

function gstLabel(taxPaise: number, taxablePaise: number): string {
  if (taxPaise <= 0 || taxablePaise <= 0) return 'GST';
  const pct = (taxPaise / taxablePaise) * 100;
  if (pct > 100) return 'GST';
  const whole = Math.round(pct);
  return `GST at ${Math.abs(pct - whole) <= 0.1 ? whole : pct.toFixed(1)}%`;
}

function layout(title: string, body: string, villaName: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#fffdf5;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #eae3d2;border-radius:12px">
<tr><td style="padding:24px 28px">
<p style="margin:0 0 4px;font-size:13px;color:#665412">${esc(villaName)}</p>
<h1 style="margin:0 0 16px;font-size:20px">${esc(title)}</h1>
${body}
</td></tr></table></body></html>`;
}

const p = (html: string) =>
  `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${html}</p>`;

function contactsBlock(ctx: GuestEmailContext): string {
  const lines = [
    ...(ctx.whatsApp
      ? [
          `WhatsApp: <a href="https://wa.me/${ctx.whatsApp.replace(/\D/g, '')}">${esc(ctx.whatsApp)}</a>`,
        ]
      : []),
    ...ctx.contacts.map(
      (c) =>
        `${esc(c.role)}: ${esc(c.name)}, <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>`,
    ),
  ];

  return lines.length
    ? `<p style="margin:16px 0 4px;font-size:13px;color:#665412">If you need us</p><p style="margin:0 0 12px;font-size:14px;line-height:1.6">${lines.join('<br>')}</p>`
    : '';
}

/**
 * The plain-text alternative. Every multipart message carries one: it is what
 * text-only clients show, and a transactional sender without one reads as bulk
 * mail to the filters that decide whether a confirmation reaches an inbox.
 *
 * It says the same things in the same order as the HTML. Where a block is
 * skipped there (no refund ladder, no company footer), it is skipped here.
 */
function confirmationText(
  ctx: GuestEmailContext,
  v: {
    nights: number;
    fName: string;
    checkInAt: string;
    checkOutAt: string;
    stayLine: string;
    phone: string | null;
    paidLine: string;
    extraGuestLabel: string;
    refunds: CancellationOutlook | null;
    site: string | null;
    base: number;
    extra: number;
    discount: number;
    tax: number;
    total: number;
    paid: number;
    paidInFull: boolean;
    depositUnknown: boolean;
    balanceDue: number;
    taxable: number;
    children: number;
  },
): string {
  const money = (label: string, amount: string) =>
    `  ${label.padEnd(28)}${amount}`;

  const payment =
    v.total > 0
      ? [
          '',
          'PAYMENT',
          money(
            `Stay, ${v.nights} ${v.nights === 1 ? 'night' : 'nights'}`,
            inrP(v.base),
          ),
          ...(v.extra > 0 ? [money(v.extraGuestLabel, inrP(v.extra))] : []),
          ...(v.discount > 0
            ? [
                money(
                  `Discount${ctx.discountCode ? ` (${ctx.discountCode})` : ''}`,
                  `-${inrP(v.discount)}`,
                ),
              ]
            : []),
          ...(v.tax > 0
            ? [money(gstLabel(v.tax, v.taxable), inrP(v.tax))]
            : []),
          money('Total', inrP(v.total)),
          ...(ctx.paymentStatus === 'partially_paid'
            ? [money('Deposit received', v.depositUnknown ? '-' : inrP(v.paid))]
            : v.paid > 0
              ? [money(v.paidLine, inrP(v.paid))]
              : []),
          ...(v.balanceDue > 0 && !v.depositUnknown
            ? [money('Balance due', inrP(v.balanceDue))]
            : []),
          ...(v.paidInFull ? ['', 'Amount is paid in full.'] : []),
          '',
          'Note: A refundable security deposit might be requested upon check-in.',
          'This is in addition to the online payment. Please contact the property',
          'in case of questions.',
        ]
      : [];

  const cancellation = v.refunds
    ? [
        '',
        'CANCELLATIONS & REFUND',
        ...(v.refunds.state === 'none'
          ? ['This booking is non-refundable.']
          : [
              ...(v.refunds.state === 'partial'
                ? [
                    `This booking may be eligible for a refund if cancelled on or before ${v.refunds.lastRefundableAt}.`,
                    '',
                  ]
                : []),
              ...v.refunds.rows.map(
                (r) =>
                  `  ${r.when} - ${r.refundPaise > 0 ? `${inrP(r.refundPaise)} will be refunded` : 'no refund'}`,
              ),
            ]),
        ...(v.refunds.state !== 'none' && ctx.supportEmail
          ? [
              '',
              `For cancellations, email us at ${ctx.supportEmail} with your booking reference.`,
              'Approved refunds are generally processed to the original payment',
              'method within 5 to 7 working days.',
            ]
          : []),
      ]
    : [];

  // The HTML links these three inline; plain text has to spell them out.
  const site = (v.site ?? DEFAULT_VILLA_SITE_URL).replace(/\/+$/, '');
  const policies = [
    '',
    'Please note that this booking is subject to our Privacy Policy, Terms of',
    'Service and Cancellation Policy.',
    `  Privacy Policy: ${site}/privacy`,
    `  Terms of Service: ${site}/terms`,
    `  Cancellation Policy: ${site}/cancellation`,
  ];

  const footer = [
    ctx.legalName,
    ctx.legalAddress,
    ctx.cin ? `CIN: ${ctx.cin}` : null,
    ctx.gstin ? `GSTIN: ${ctx.gstin}` : null,
  ].filter(Boolean) as string[];

  return [
    'YOUR BOOKING IS CONFIRMED',
    v.stayLine,
    '',
    `Dear ${v.fName},`,
    '',
    `Your booking is confirmed${v.paidInFull ? ' and payment has been received' : ''}.`,
    'Please keep this email for your records.',
    ...(ctx.bookingCode ? ['', `Booking reference: ${ctx.bookingCode}`] : []),
    '',
    `Check-in   ${dateWithWeekday(ctx.checkIn)}, from ${v.checkInAt}`,
    `Check-out  ${dateWithWeekday(ctx.checkOut)}, by ${v.checkOutAt}`,
    `Nights     ${v.nights}`,
    `Guests     ${guestLine(ctx.adults, v.children)}`,
    `Villa      ${ctx.villaName}${ctx.propertyLocation ? `, ${ctx.propertyLocation}` : ''}`,
    ...(ctx.bookedAt && bookedOnFmt(ctx.bookedAt)
      ? [`Booked on  ${bookedOnFmt(ctx.bookedAt)}`]
      : []),
    ...(ctx.guestEmail ? [`Email      ${ctx.guestEmail}`] : []),
    ...(v.phone ? [`Mobile     ${v.phone}`] : []),
    '',
    'We will send the exact address and check-in details to this mobile number',
    'via WhatsApp. If the email address or mobile number above is incorrect,',
    'please let us know.',
    ...payment,
    ...(ctx.bookingUrl ? ['', `View your booking: ${ctx.bookingUrl}`] : []),
    '',
    'WHAT HAPPENS NEXT',
    '1. Before you arrive',
    '   Around 24 hours before check-in, we will share the exact address,',
    '   directions and access instructions with you.',
    ...(ctx.whatsApp
      ? [
          '2. Need anything before then?',
          `   Just WhatsApp us on ${formatPhoneNumber(ctx.whatsApp)}. We are usually available`,
          '   during the day and aim to respond within an hour.',
        ]
      : []),
    ...cancellation,
    ...policies,
    '',
    'IF YOU NEED US',
    ...(ctx.whatsApp ? [`WhatsApp: ${formatPhoneNumber(ctx.whatsApp)}`] : []),
    ...ctx.contacts.map(
      (c) => `${c.role}: ${c.name}, ${formatPhoneNumber(c.phone)}`,
    ),
    ...(ctx.supportEmail ? [`Email: ${ctx.supportEmail}`] : []),
    '',
    'We look forward to hosting you.',
    `Team ${ctx.villaName}`,
    ...(footer.length ? ['', ...footer] : []),
    '',
    'You are receiving this email because you have booked a stay with us.',
  ].join('\n');
}

export function renderGuestEmail(
  template: GuestEmailTemplate,
  ctx: GuestEmailContext,
): { subject: string; html: string; text?: string } {
  const ref = ctx.bookingCode ? ` (${ctx.bookingCode})` : '';

  if (template === 'booking_confirmation') {
    const nights =
      (Date.parse(ctx.checkOut) - Date.parse(ctx.checkIn)) / (24 * 3_600_000);
    const fName = firstName(ctx.guestName);
    const checkInAt = time12(ctx.checkInTime, '14:00');
    const checkOutAt = time12(ctx.checkOutTime, '11:00');
    const stayLine = `${stayRange(ctx.checkIn, ctx.checkOut)} · ${nights} ${nights === 1 ? 'night' : 'nights'}`;

    const base = ctx.baseAmountPaise ?? 0;
    const extra = ctx.extraGuestAmountPaise ?? 0;
    const discount = ctx.discountAmountPaise ?? 0;
    const tax = ctx.taxAmountPaise ?? 0;
    const total = ctx.totalAmountPaise ?? 0;
    const paid =
      ctx.amountPaidPaise ?? (ctx.paymentStatus === 'paid' ? total : 0);
    const paidInFull = ctx.paymentStatus === 'paid';
    // A part-paid stay whose deposit was never receipted: we know money came
    // in but not how much, so no figure is printed rather than a wrong one.
    const depositUnknown = ctx.paymentStatus === 'partially_paid' && paid <= 0;
    const balanceDue = Math.max(0, total - paid);
    const taxable = base + extra - discount;
    const children = ctx.children ?? 0;
    const phone = ctx.guestPhone ? formatPhoneNumber(ctx.guestPhone) : null;

    // "Extra guests, 6", matching "Stay, 1 night". A comma rather than
    // brackets: the discount row already spends brackets on its code, and a
    // bracketed number beside a money column reads as a negative amount.
    const extraGuestLabel =
      ctx.extraGuests && ctx.extraGuests > 0
        ? `Extra guests, ${ctx.extraGuests}`
        : 'Extra guests';

    // The ladder quotes what would come BACK, so it is a percentage of what
    // the guest has actually paid - never of the contract total.
    //
    // The booking site passes its total safely because a stay exists there
    // only once Razorpay has settled it in full. Ooruda sends this same
    // confirmation for bookings staff enter by hand, where unpaid and
    // part-paid are the ordinary cases, so the same argument would have
    // promised an unpaid ₹54,280 booking that ₹54,280 "will be refunded",
    // in writing, under the company's CIN and GSTIN.
    //
    // So: nothing received, or an amount we cannot name, prints no ladder at
    // all - the policy links below it still go out. Filtered against when the
    // booking was made, so a guest booking close in is never shown deadlines
    // that passed before they paid; with no booked-at timestamp there is
    // nothing to filter against and again no ladder is printed.
    const refunds: CancellationOutlook | null =
      ctx.bookedAt && paid > 0 && !depositUnknown
        ? cancellationOutlook(ctx.checkIn, paid, ctx.bookedAt)
        : null;

    // "Paid 13 Oct 2026 · Razorpay" rather than a bare "Paid": the date and
    // the method are what a guest checks this line against. It is the date
    // the money arrived, not the date the booking was made - a hand-entered
    // booking is commonly receipted days later, and dating the receipt to the
    // booking would contradict the villa's own ledger. Unknown prints no date
    // rather than the wrong one.
    const paidOn = ctx.paymentDate ? paidDate(ctx.paymentDate) : null;
    const paidLine = ['Paid', paidOn]
      .filter(Boolean)
      .join(' ')
      .concat(ctx.paymentMethod ? ` · ${ctx.paymentMethod}` : '');

    const site = (ctx.siteBaseUrl ?? DEFAULT_VILLA_SITE_URL).replace(
      /\/+$/,
      '',
    );
    const policyNote = `Please note that this booking is subject to our ${policyLink(`${site}/privacy`, 'Privacy Policy')}, ${policyLink(`${site}/terms`, 'Terms of Service')} and ${policyLink(`${site}/cancellation`, 'Cancellation Policy')}.`;

    const preheader = `${ctx.bookingCode ?? ''} · ${stayRange(ctx.checkIn, ctx.checkOut)} · ${
      paidInFull
        ? `${inrP(total)} paid in full`
        : depositUnknown
          ? 'balance due at check-in'
          : `${inrP(balanceDue)} balance due`
    }`;

    const paymentRows = [
      total > 0
        ? payRow(
            `Stay, ${nights} ${nights === 1 ? 'night' : 'nights'}`,
            inrP(base),
          )
        : '',
      extra > 0 ? payRow(esc(extraGuestLabel), inrP(extra)) : '',
      discount > 0
        ? payRow(
            `Discount${ctx.discountCode ? ` <span style="color:${MUTED};font-size:13px;">(${esc(ctx.discountCode)})</span>` : ''}`,
            `-${inrP(discount)}`,
            true,
          )
        : '',
      tax > 0 ? payRow(gstLabel(tax, taxable), inrP(tax)) : '',
      total > 0
        ? `<tr><td colspan="2" style="padding:4px 0 0;"><div style="height:1px;background:${RULE};"></div></td></tr>`
        : '',
      total > 0
        ? `<tr>
        <td style="padding:9px 0 2px;font-family:${SANS};font-size:16px;font-weight:bold;color:${INK};">Total</td>
        <td style="padding:9px 0 2px;font-family:${SANS};font-size:16px;font-weight:bold;color:${INK};text-align:right;white-space:nowrap;">${esc(inrP(total))}</td>
      </tr>`
        : '',
      ctx.paymentStatus === 'partially_paid'
        ? `<tr>
        <td style="padding:0 0 4px;font-family:${SANS};font-size:13px;color:${MUTED};">Deposit received</td>
        <td style="padding:0 0 4px;font-family:${SANS};font-size:13px;color:${MUTED};text-align:right;white-space:nowrap;">${depositUnknown ? '&mdash;' : esc(inrP(paid))}</td>
      </tr>`
        : paid > 0
          ? `<tr>
        <td style="padding:0 0 4px;font-family:${SANS};font-size:13px;color:${MUTED};">${esc(paidLine)}</td>
        <td style="padding:0 0 4px;font-family:${SANS};font-size:13px;color:${MUTED};text-align:right;white-space:nowrap;">${esc(inrP(paid))}</td>
      </tr>`
          : '',
      balanceDue > 0 && !depositUnknown
        ? `<tr>
        <td style="padding:6px 0 4px;font-family:${SANS};font-size:14px;font-weight:bold;color:${INK};">Balance due</td>
        <td style="padding:6px 0 4px;font-family:${SANS};font-size:14px;font-weight:bold;color:${INK};text-align:right;white-space:nowrap;">${esc(inrP(balanceDue))}</td>
      </tr>`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const paidInFullBadge = paidInFull
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;background:#f1f7f2;border:1px solid #cfe3d5;border-radius:8px;">
      <tr><td style="padding:11px 14px;font-family:${SANS};font-size:14px;font-weight:bold;color:${GREEN};">&#10003;&nbsp; Amount is paid in full</td></tr>
    </table>`
      : '';

    const partialPayNote =
      ctx.paymentStatus === 'partially_paid'
        ? `<p style="margin:14px 0 0;font-family:${SANS};font-size:13px;line-height:1.6;color:#5d5550;">A deposit has been received. The balance is due at check-in.</p>`
        : ctx.paymentStatus === 'unpaid'
          ? `<p style="margin:14px 0 0;font-family:${SANS};font-size:13px;line-height:1.6;color:#5d5550;">Payment is due at check-in.</p>`
          : '';

    const contactRows = [
      ctx.whatsApp
        ? `<tr>
        <td style="padding:0 14px 8px 0;font-family:${SANS};font-size:14px;color:${MUTED};vertical-align:top;width:30%;white-space:nowrap;">WhatsApp</td>
        <td style="padding:0 0 8px;vertical-align:top;">
          <a href="https://wa.me/${ctx.whatsApp.replace(/\D/g, '')}" style="font-family:${SANS};font-size:14px;color:${MAROON};font-weight:bold;">${esc(formatPhoneNumber(ctx.whatsApp))}</a>
          <br><span style="font-family:${SANS};font-size:13px;color:${MUTED};">The fastest way to reach us.</span>
        </td>
      </tr>`
        : '',
      ...ctx.contacts.map(
        (c) => `<tr>
        <td style="padding:0 14px 8px 0;font-family:${SANS};font-size:14px;color:${MUTED};vertical-align:top;width:30%;white-space:nowrap;">${esc(c.role)}</td>
        <td style="padding:0 0 8px;vertical-align:top;">
          <a href="tel:${esc(c.phone)}" style="font-family:${SANS};font-size:14px;color:${MAROON};">${esc(c.name)}, ${esc(formatPhoneNumber(c.phone))}</a>
        </td>
      </tr>`,
      ),
      ctx.supportEmail
        ? `<tr>
        <td style="padding:0 14px 0 0;font-family:${SANS};font-size:14px;color:${MUTED};vertical-align:top;width:30%;white-space:nowrap;">Email</td>
        <td style="vertical-align:top;">
          <a href="mailto:${esc(ctx.supportEmail)}" style="font-family:${SANS};font-size:14px;color:${MAROON};">${esc(ctx.supportEmail)}</a>
        </td>
      </tr>`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your booking is confirmed</title>
<style>
:root { color-scheme: light only; }
.tick td  { padding:13px !important; font-size:0 !important; line-height:0 !important; border-radius:24px !important; }
.tick img { width:22px !important; height:22px !important; display:block !important; }
@media only screen and (max-width:430px) {
  .stay-cell  { padding:12px 10px !important; }
  .stay-date  { font-size:13px !important; }
  .stay-time  { font-size:12px !important; }
  .nights-col { width:52px !important; }
  .pad        { padding-left:22px !important; padding-right:22px !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background:${CREAM};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(preheader)}</div>
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${'&#847;&zwnj;&nbsp;'.repeat(60)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;background:#ffffff;border:1px solid ${RULE};border-radius:14px;overflow:hidden;">

  <!-- Header -->
  <tr><td class="pad" style="background:${MAROON};padding:30px 36px 34px;text-align:center;">
    <table role="presentation" class="tick" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
      <td align="center" valign="middle" bgcolor="${OK_COLOR}" style="background:${OK_COLOR};border-radius:24px;padding:13px;font-size:0;line-height:0;mso-line-height-rule:exactly;">
        <img src="${EMAIL_ASSET_BASE}/email/success-tick.png" width="22" height="22" alt="" style="display:block;width:22px;height:22px;border:0;">
      </td>
    </tr></table>
    <h1 style="margin:16px 0 6px;font-family:${SERIF};font-size:28px;font-weight:normal;color:#ffffff;">Your booking is confirmed</h1>
    <p style="margin:0;font-family:${SANS};font-size:14px;color:rgba(255,255,255,0.78);">${esc(stayLine)}</p>
  </td></tr>

  <tr><td class="pad" style="padding:32px 36px 36px;">

    <p style="margin:0 0 14px;font-family:${SANS};font-size:15px;color:${INK};">Dear ${esc(fName)},</p>
    <p style="margin:0 0 24px;font-family:${SANS};font-size:15px;line-height:1.65;color:#5d5550;">
      Your booking is confirmed${paidInFull ? ' and payment has been received' : ''}. Please keep this email for your records.
    </p>

    ${
      ctx.bookingCode
        ? `<!-- Booking reference -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CARD};border:1px solid ${RULE};border-radius:10px;">
      <tr><td style="padding:16px;text-align:center;">
        <p style="margin:0 0 6px;font-family:${SANS};font-size:10px;letter-spacing:1.6px;color:${MUTED};text-transform:uppercase;">Booking reference</p>
        <p style="margin:0;font-family:${SANS};font-size:22px;font-weight:bold;letter-spacing:2px;color:${MAROON};">${esc(ctx.bookingCode)}</p>
      </td></tr>
    </table>`
        : ''
    }

    <!-- Check-in / nights / check-out -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;border:1px solid ${RULE};border-radius:10px;">
      <tr>
        <td class="stay-cell" style="padding:14px 16px;vertical-align:top;border-right:1px solid ${RULE};">
          <p style="margin:0 0 4px;font-family:${SANS};font-size:10px;letter-spacing:1.4px;color:${MUTED};text-transform:uppercase;white-space:nowrap;">Check-in</p>
          <p class="stay-date" style="margin:0;font-family:${SANS};font-size:15px;font-weight:bold;color:${INK};">${esc(dateWithWeekday(ctx.checkIn))}</p>
          <p class="stay-time" style="margin:2px 0 0;font-family:${SANS};font-size:13px;color:${MUTED};">from ${esc(checkInAt)}</p>
        </td>
        <td class="nights-col" width="74" style="width:74px;padding:14px 8px;text-align:center;vertical-align:middle;border-right:1px solid ${RULE};">
          <p style="margin:0;font-family:${SANS};font-size:19px;font-weight:bold;color:${INK};">${nights}</p>
          <p style="margin:2px 0 0;font-family:${SANS};font-size:10px;letter-spacing:1.2px;color:${MUTED};text-transform:uppercase;">${nights === 1 ? 'Night' : 'Nights'}</p>
        </td>
        <td class="stay-cell" style="padding:14px 16px;vertical-align:top;">
          <p style="margin:0 0 4px;font-family:${SANS};font-size:10px;letter-spacing:1.4px;color:${MUTED};text-transform:uppercase;white-space:nowrap;">Check-out</p>
          <p class="stay-date" style="margin:0;font-family:${SANS};font-size:15px;font-weight:bold;color:${INK};">${esc(dateWithWeekday(ctx.checkOut))}</p>
          <p class="stay-time" style="margin:2px 0 0;font-family:${SANS};font-size:13px;color:${MUTED};">by ${esc(checkOutAt)}</p>
        </td>
      </tr>
    </table>

    <!-- Details -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
      ${detailRow('Guests', esc(guestLine(ctx.adults, children)))}
      ${detailRow('Villa', esc(ctx.villaName), ctx.propertyLocation ?? undefined)}
      ${ctx.bookedAt && bookedOnFmt(ctx.bookedAt) ? detailRow('Booked on', esc(bookedOnFmt(ctx.bookedAt)!)) : ''}
      ${ctx.guestEmail ? detailRow('Email', `<a href="mailto:${esc(ctx.guestEmail)}" style="color:${MAROON};">${esc(ctx.guestEmail)}</a>`) : ''}
      ${ctx.guestPhone ? detailRow('Mobile', `<a href="tel:${esc(ctx.guestPhone)}" style="color:${MAROON};">${esc(phone ?? ctx.guestPhone)}</a>`) : ''}
    </table>
    <p style="margin:10px 0 0;font-family:${SANS};font-size:13px;line-height:1.6;color:${MUTED};">
      We will send the exact address and check-in details to this mobile number via WhatsApp.
      If the email address or mobile number above is incorrect, please let us know.
    </p>

    ${emailRule()}

    ${
      total > 0
        ? `<!-- Payment -->
    ${sectionLabel('Payment')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${paymentRows}
    </table>
    ${paidInFullBadge}
    ${partialPayNote}
    <p style="margin:14px 0 0;font-family:${SANS};font-size:13px;line-height:1.6;color:#5d5550;">
      <strong style="color:${INK};">Note:</strong> A refundable security deposit might be requested upon check-in. This is in addition to the online payment. Please contact the property in case of questions.
    </p>
    ${
      ctx.bookingUrl
        ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:26px auto 4px;">
      <tr><td style="background:${MAROON};border-radius:9px;">
        <a href="${esc(ctx.bookingUrl)}" style="display:inline-block;padding:13px 32px;font-family:${SANS};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">View your booking</a>
      </td></tr>
    </table>`
        : ''
    }
    ${emailRule()}`
        : ''
    }

    <!-- What happens next -->
    ${sectionLabel('What happens next')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:0 14px 20px 0;vertical-align:top;width:26px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="24" height="24" align="center" style="width:24px;height:24px;background:${CARD};border:1px solid ${RULE};border-radius:12px;font-family:${SANS};font-size:12px;font-weight:bold;color:${MUTED};line-height:24px;">1</td>
          </tr></table>
        </td>
        <td style="padding:0 0 20px;vertical-align:top;">
          <p style="margin:0 0 5px;font-family:${SANS};font-size:15px;font-weight:bold;color:${INK};">Before you arrive</p>
          <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.6;color:#5d5550;">Around 24 hours before check-in, we will share the exact address, directions and access instructions with you.</p>
        </td>
      </tr>
      ${
        ctx.whatsApp
          ? `<tr>
        <td style="padding:0 14px 20px 0;vertical-align:top;width:26px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="24" height="24" align="center" style="width:24px;height:24px;background:${CARD};border:1px solid ${RULE};border-radius:12px;font-family:${SANS};font-size:12px;font-weight:bold;color:${MUTED};line-height:24px;">2</td>
          </tr></table>
        </td>
        <td style="padding:0 0 20px;vertical-align:top;">
          <p style="margin:0 0 5px;font-family:${SANS};font-size:15px;font-weight:bold;color:${INK};">Need anything before then?</p>
          <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.6;color:#5d5550;">Just <a href="https://wa.me/${ctx.whatsApp.replace(/\D/g, '')}" style="color:${MAROON};">WhatsApp</a> us. We&#39;re usually available during the day and aim to respond within an hour.</p>
        </td>
      </tr>`
          : ''
      }
    </table>

    ${
      refunds
        ? `${emailRule()}

    <!-- Cancellations -->
    ${sectionLabel('Cancellations & refund')}
    ${
      refunds.state === 'none'
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${RED_TINT};border:1px solid ${RED_EDGE};border-radius:10px;">
      <tr><td style="padding:13px 16px;font-family:${SANS};font-size:14px;font-weight:bold;color:${RED};">This booking is non-refundable.</td></tr>
    </table>`
        : `${
            refunds.state === 'partial'
              ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${AMBER_TINT};border:1px solid ${AMBER_EDGE};border-radius:10px;margin-bottom:12px;">
      <tr><td style="padding:13px 16px;font-family:${SANS};font-size:14px;line-height:1.5;color:${AMBER};">
        <strong>This booking may be eligible for a refund</strong> if cancelled on or before ${esc(refunds.lastRefundableAt ?? '')}.
      </td></tr>
    </table>`
              : ''
          }
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CARD};border:1px solid ${RULE};border-radius:10px;">
      ${refunds.rows
        .map(
          (r, i) => `<tr>
        <td style="padding:${i === 0 ? '11px' : '6px'} 14px ${i === refunds.rows.length - 1 ? '11px' : '6px'};font-family:${SANS};font-size:13px;color:${INK};">${esc(r.when)}</td>
        <td style="padding:${i === 0 ? '11px' : '6px'} 14px ${i === refunds.rows.length - 1 ? '11px' : '6px'};font-family:${SANS};font-size:13px;color:${INK};text-align:right;">${
          r.refundPaise > 0
            ? `<strong style="white-space:nowrap;">${esc(inrP(r.refundPaise))}</strong> will be refunded`
            : '<span style="white-space:nowrap;">No refund</span>'
        }</td>
      </tr>`,
        )
        .join('')}
    </table>`
    }
    ${
      // Nothing is coming back, so a refund address and a processing time
      // would contradict the line directly above them. The policy sentence is
      // common to all three states, so it is appended rather than repeated.
      refunds.state !== 'none' && ctx.supportEmail
        ? `<p style="margin:10px 0 0;font-family:${SANS};font-size:13px;line-height:1.6;color:${MUTED};">For cancellations, email us at <a href="mailto:${esc(ctx.supportEmail)}" style="color:${MAROON};font-weight:bold;">${esc(ctx.supportEmail)}</a> with your booking reference. Approved refunds are generally processed to the original payment method within 5 to 7 working days.${policyNote ? ` ${policyNote}` : ''}</p>`
        : policyNote
          ? `<p style="margin:10px 0 0;font-family:${SANS};font-size:13px;line-height:1.6;color:${MUTED};">${policyNote}</p>`
          : ''
    }`
        : policyNote
          ? `${emailRule()}
    <p style="margin:0;font-family:${SANS};font-size:13px;line-height:1.6;color:${MUTED};">${policyNote}</p>`
          : ''
    }

    ${emailRule()}

    <!-- Contact -->
    ${sectionLabel('If you need us')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${contactRows}
    </table>

    <p style="margin:26px 0 6px;font-family:${SANS};font-size:14px;line-height:1.6;color:#5d5550;">We look forward to hosting you.</p>
    <p style="margin:0;font-family:${SERIF};font-size:17px;line-height:1.4;color:${MAROON};">Team ${esc(ctx.villaName)}</p>

  </td></tr>
${footerBlock(ctx)}
</table>
</td></tr>
</table>
</body>
</html>`;

    return {
      subject: `Your booking is confirmed · ${ctx.bookingCode ?? ''} · ${ctx.villaName}`,
      html,
      text: confirmationText(ctx, {
        nights,
        fName,
        checkInAt,
        checkOutAt,
        stayLine,
        phone,
        paidLine,
        extraGuestLabel,
        refunds,
        site,
        base,
        extra,
        discount,
        tax,
        total,
        paid,
        paidInFull,
        depositUnknown,
        balanceDue,
        taxable,
        children,
      }),
    };
  }

  if (template === 'pre_arrival') {
    return {
      // Date, not "tomorrow": a hand-sent copy can go out days earlier.
      subject: `Your stay at ${ctx.villaName} on ${shortDate(ctx.checkIn)}${ref}`,
      html: layout(
        `See you soon, ${firstName(ctx.guestName)}`,
        [
          p(`We are looking forward to hosting you at ${esc(ctx.villaName)}.`),
          p(
            `<strong>Check-in:</strong> ${esc(longDate(ctx.checkIn))}, from ${time12(ctx.checkInTime, '14:00')}<br>` +
              `<strong>Check-out:</strong> ${esc(longDate(ctx.checkOut))}, by ${time12(ctx.checkOutTime, '11:00')}` +
              (ctx.bookingCode
                ? `<br><strong>Booking:</strong> ${esc(ctx.bookingCode)}`
                : ''),
          ),
          p(
            `Please carry a photo ID for each adult guest (Aadhaar, passport or driving licence), if you have not shared it already.`,
          ),
          contactsBlock(ctx),
          p('Safe travels!'),
        ].join(''),
        ctx.villaName,
      ),
    };
  }

  return {
    subject: `Thank you for staying at ${ctx.villaName}${ref}`,
    html: layout(
      `Thank you, ${firstName(ctx.guestName)}`,
      [
        p(
          `Thank you for staying with us at ${esc(ctx.villaName)}. We hope you had a wonderful time.`,
        ),
        p(
          `If anything could have been better, or you would like to come back, just reply on WhatsApp. We would love to host you again.`,
        ),
        contactsBlock({ ...ctx, contacts: [] }),
      ].join(''),
      ctx.villaName,
    ),
  };
}
