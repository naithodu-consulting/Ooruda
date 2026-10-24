import { addDays } from '~/lib/villa-db/dates';

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
const SANS = 'Helvetica,Arial,sans-serif';
const SERIF = "Georgia,'Times New Roman',serif";

// Asset base from villa-booking's publicly hosted files (the success-tick PNG).
const EMAIL_ASSET_BASE = 'https://villa-booking-psi.vercel.app';

function emailRule(): string {
  return `<div style="height:1px;background:${RULE};margin:28px 0;"></div>`;
}

function sectionLabel(text: string): string {
  return `<p style="margin:0 0 12px;font-family:${SANS};font-size:11px;letter-spacing:1.4px;color:${MUTED};text-transform:uppercase;">${esc(text)}</p>`;
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:4px 12px 4px 0;font-family:${SANS};font-size:14px;color:${MUTED};vertical-align:top;width:34%;">${esc(label)}</td>
    <td style="padding:4px 0;font-family:${SANS};font-size:14px;color:${INK};vertical-align:top;">${value}</td>
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

export function renderGuestEmail(
  template: GuestEmailTemplate,
  ctx: GuestEmailContext,
): { subject: string; html: string } {
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
      extra > 0 ? payRow('Extra guests', inrP(extra)) : '',
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
        <td style="padding:0 0 4px;font-family:${SANS};font-size:13px;color:${MUTED};">Paid</td>
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
          <a href="https://wa.me/${ctx.whatsApp.replace(/\D/g, '')}" style="font-family:${SANS};font-size:14px;color:${MAROON};font-weight:bold;">${esc(ctx.whatsApp)}</a>
          <br><span style="font-family:${SANS};font-size:13px;color:${MUTED};">The fastest way to reach us.</span>
        </td>
      </tr>`
        : '',
      ...ctx.contacts.map(
        (c) => `<tr>
        <td style="padding:0 14px 8px 0;font-family:${SANS};font-size:14px;color:${MUTED};vertical-align:top;width:30%;white-space:nowrap;">${esc(c.role)}</td>
        <td style="padding:0 0 8px;vertical-align:top;">
          <a href="tel:${esc(c.phone)}" style="font-family:${SANS};font-size:14px;color:${MAROON};">${esc(c.name)}, ${esc(c.phone)}</a>
        </td>
      </tr>`,
      ),
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
      Your booking is confirmed. Please keep this email for your records.
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
      ${detailRow('Villa', esc(ctx.villaName))}
      ${ctx.guestPhone ? detailRow('Mobile', `<a href="tel:${esc(ctx.guestPhone)}" style="color:${MAROON};">${esc(ctx.guestPhone)}</a>`) : ''}
    </table>
    <p style="margin:10px 0 0;font-family:${SANS};font-size:13px;line-height:1.6;color:${MUTED};">
      We will share arrival details and the exact address with you on WhatsApp before check-in.
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
      <strong style="color:${INK};">Note:</strong> A refundable security deposit is collected upon check-in. This is in addition to any amount shown above.
    </p>
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
      <tr>
        <td style="padding:0 14px 20px 0;vertical-align:top;width:26px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="24" height="24" align="center" style="width:24px;height:24px;background:${CARD};border:1px solid ${RULE};border-radius:12px;font-family:${SANS};font-size:12px;font-weight:bold;color:${MUTED};line-height:24px;">2</td>
          </tr></table>
        </td>
        <td style="padding:0 0 20px;vertical-align:top;">
          <p style="margin:0 0 5px;font-family:${SANS};font-size:15px;font-weight:bold;color:${INK};">Please carry valid photo IDs</p>
          <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.6;color:#5d5550;">Aadhaar, passport or driving licence for each adult guest.</p>
        </td>
      </tr>
    </table>

    ${emailRule()}

    <!-- Contact -->
    ${sectionLabel('If you need us')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${contactRows}
    </table>

    <p style="margin:26px 0 6px;font-family:${SANS};font-size:14px;line-height:1.6;color:#5d5550;">We look forward to hosting you.</p>
    <p style="margin:0;font-family:${SERIF};font-size:17px;line-height:1.4;color:${MAROON};">Team ${esc(ctx.villaName)}</p>

  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

    return {
      subject: `Your booking is confirmed · ${ctx.bookingCode ?? ''} · ${ctx.villaName}`,
      html,
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
