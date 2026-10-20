import { addDays } from '~/lib/villa-db/dates';

/**
 * Automatic guest emails: WHEN each is due and WHAT it says. Pure (no I/O);
 * the sender (guest-email-runner.ts) re-checks every booking on the booking
 * site right before sending.
 *
 *   pre_arrival  from 10:00 IST the day before check-in, until 3 hours
 *                before check-in time (a booking made later gets none);
 *   thank_you    3 hours after staff press Check out, for up to 7 days.
 */

export type GuestEmailTemplate = 'pre_arrival' | 'thank_you';

export const GUEST_EMAIL_LABELS: Record<GuestEmailTemplate, string> = {
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
