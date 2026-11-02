import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import type { Database } from '~/lib/database.types';
import {
  type SiteBooking,
  getBooking,
  getBookingAccessToken,
  getPropertyLocation,
  listBookings,
  listSitePayments,
} from '~/lib/villa-db/bookings';
import {
  type VillaSite,
  getVillaSite,
  getVillaSiteAsSystem,
} from '~/lib/villa-db/client';
import { addDays, todayIst } from '~/lib/villa-db/dates';
import { getBaseRates } from '~/lib/villa-db/rates';

import { recordBookingActivity } from './activity';
import { NO_PAYMENT_REASON, hasRecordedPayment } from './booking-payments';
import {
  DEFAULT_VILLA_ENTITY,
  DEFAULT_VILLA_SITE_URL,
  type GuestEmailContext,
  type GuestEmailTemplate,
  formatSenderAddress,
  GUEST_EMAIL_LABELS,
  isPreArrivalDue,
  isThankYouDue,
  renderGuestEmail,
  THANK_YOU_WINDOW_DAYS,
} from './guest-emails';
import { sendVillaEmail } from './guest-mailer';
import { contactCategoryLabel, paymentModeLabel } from './labels';
import { type LedgerStatus, summariseLedger } from './ledger';

/**
 * Sends the automatic guest emails that are due (guest-emails.ts has the
 * rules). Every booking is re-read LIVE from the booking site right before
 * its email goes: a cancellation or date change since the last sync stops
 * it. Each automatic email is claimed in villa_message_log before sending,
 * so two runs at once never send it twice.
 *
 * Runs from the scheduled route and on villa dashboard visits.
 */

/**
 * The booking site's sender (plan decision): set per deployment.
 *
 * Falls back to the company's own reservations address rather than to
 * nothing, so guest mail still leaves a deployment that has not set
 * VILLA_EMAIL_FROM. EMAIL_SENDER is deliberately NOT a fallback: that is
 * Ooruda's own ooruda.com sender, and Resend rejects a `from:` whose domain
 * is not verified in the key's account, so it would 403 rather than send.
 */
function senderAddress(): string {
  return (
    process.env.VILLA_EMAIL_FROM?.trim() || DEFAULT_VILLA_ENTITY.supportEmail
  );
}

type Admin = SupabaseClient<Database>;

interface PropertyContext {
  accountId: string;
  propertyId: string;
  name: string;
  whatsApp: string | null;
  site: VillaSite;
  checkInTime: string | null;
  checkOutTime: string | null;
  contacts: GuestEmailContext['contacts'];
  /** "Mangalore, Karnataka", from the booking site's own property record. */
  location: string | null;
  /** Guests included in the nightly rate: what "extra guests" counts above. */
  includedGuests: number;
  /** The company behind the villa, for the email's legal footer. */
  legalName: string | null;
  legalAddress: string | null;
  cin: string | null;
  gstin: string | null;
  supportEmail: string | null;
}

/** The property columns the email needs beyond the ones the caller passes. */
type PropertyRow = {
  id: string;
  account_id: string;
  name: string;
  whatsapp_number: string | null;
  legal_name?: string | null;
  legal_address?: string | null;
  cin?: string | null;
  gstin?: string | null;
  support_email?: string | null;
};

export const EMAIL_PROPERTY_COLUMNS =
  'id, account_id, name, whatsapp_number, legal_name, legal_address, cin, gstin, support_email';

/**
 * The booking site's public origin, for the three policy links and the
 * guest's own booking page. Unset in a deployment that has no site URL
 * configured, and every block that needs it is then skipped rather than
 * linking nowhere.
 */
function siteBaseUrl(): string {
  const url = process.env.VILLA_SITE_URL?.trim();

  return (url ? url : DEFAULT_VILLA_SITE_URL).replace(/\/+$/, '');
}

async function loadContext(
  admin: Admin,
  p: PropertyRow,
  options: { system?: boolean } = {},
): Promise<PropertyContext> {
  // The scheduled run has no user session, so the RLS-enforced property
  // lookup refuses it for every villa and no email would ever go out — the
  // same cause that stopped the scheduled mirror sync. The manual "Send now"
  // path keeps the RLS lookup: it runs under the member's own session, which
  // bookings-actions has already checked with requireVillaRole and its own
  // getVillaSite.
  const site = options.system
    ? await getVillaSiteAsSystem(p.account_id, p.id)
    : await getVillaSite(p.account_id, p.id);
  const [rates, location, { data: contacts, error }] = await Promise.all([
    getBaseRates(site),
    // The locality line is cosmetic: a villa whose site record has no city
    // simply loses that one sub-line, so a failure here must not stop the
    // email from going out.
    getPropertyLocation(site).catch(() => null),
    admin
      .from('villa_emergency_contacts')
      .select('name, category, phone')
      .eq('property_id', p.id)
      .eq('share_with_guests', true)
      .order('display_order'),
  ]);

  if (error) throw new Error(`contacts load failed: ${error.message}`);

  return {
    accountId: p.account_id,
    propertyId: p.id,
    name: p.name,
    whatsApp: p.whatsapp_number || DEFAULT_VILLA_ENTITY.whatsApp,
    site,
    checkInTime: rates.checkInTime,
    checkOutTime: rates.checkOutTime,
    contacts: (contacts ?? []).map((c) => ({
      name: c.name,
      role: contactCategoryLabel(c.category),
      phone: c.phone,
    })),
    location,
    includedGuests: rates.includedGuests,
    legalName: p.legal_name || DEFAULT_VILLA_ENTITY.legalName,
    legalAddress: p.legal_address || DEFAULT_VILLA_ENTITY.legalAddress,
    cin: p.cin || DEFAULT_VILLA_ENTITY.cin,
    // A GSTIN is a per-state registration, so there is no company-wide
    // default to fall back to: the line is skipped until this villa has one.
    gstin: p.gstin ?? null,
    // Falls back to the configured sender or default support email
    supportEmail:
      p.support_email || replyToAddress() || DEFAULT_VILLA_ENTITY.supportEmail,
  };
}

/** The bare address out of VILLA_EMAIL_FROM ("Name <a@b.com>" or "a@b.com"). */
function replyToAddress(): string | null {
  const from = senderAddress();

  if (!from) return null;

  return (
    /<([^>]+)>/.exec(from)?.[1]?.trim() ?? (from.includes('@') ? from : null)
  );
}

function contextFor(
  ctx: PropertyContext,
  b: SiteBooking,
  ledger?: { netPaidPaise: number; status: LedgerStatus },
  extra?: {
    bookingUrl?: string | null;
    paymentMethod?: string | null;
    paymentDate?: string | null;
  },
): GuestEmailContext {
  // The site's payment_status is not the truth for this: sitePaymentStatus()
  // pins a fully paid villa booking to 'partially_paid' so the site does not
  // issue its GST invoice before check-out. Quoting it would tell a guest who
  // has paid in full that a balance is due. Ooruda's ledger is the exact
  // record, so it wins wherever it has seen money. With no receipts the site
  // value stands, which keeps bookings taken before advances were captured
  // reading as "a deposit was received" rather than as unpaid.
  const known = ledger !== undefined && ledger.netPaidPaise > 0;

  return {
    villaName: ctx.name,
    guestName: b.guestName,
    guestEmail: b.guestEmail || undefined,
    bookedAt: b.createdAt || undefined,
    bookingCode: b.bookingCode,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    checkInTime: ctx.checkInTime,
    checkOutTime: ctx.checkOutTime,
    adults: b.adults,
    children: b.children,
    guestPhone: b.guestPhone || undefined,
    baseAmountPaise: b.baseAmountPaise,
    extraGuestAmountPaise: b.extraGuestAmountPaise,
    discountAmountPaise: b.discountAmountPaise,
    discountCode: b.discountCode,
    taxAmountPaise: b.taxAmountPaise,
    totalAmountPaise: b.totalAmountPaise,
    amountPaidPaise: known
      ? ledger.netPaidPaise
      : b.paymentStatus === 'paid'
        ? b.totalAmountPaise
        : 0,
    paymentStatus: known ? ledger.status : b.paymentStatus,
    whatsApp: ctx.whatsApp,
    contacts: ctx.contacts,
    propertyLocation: ctx.location,
    // The booking row keeps the extra-guest amount but not the head count the
    // pricing engine worked it out from, so it is derived here. Infants never
    // count towards occupancy.
    extraGuests:
      b.extraGuestAmountPaise > 0
        ? Math.max(0, b.adults + b.children - ctx.includedGuests)
        : null,
    additionalGuestsNote:
      b.extraGuestAmountPaise > 0 ||
      (ctx.includedGuests > 0 && b.adults + b.children > ctx.includedGuests),
    paymentMethod: extra?.paymentMethod ?? null,
    paymentDate: extra?.paymentDate ?? null,
    bookingUrl: extra?.bookingUrl ?? null,
    siteBaseUrl: siteBaseUrl(),
    legalName: ctx.legalName,
    legalAddress: ctx.legalAddress,
    cin: ctx.cin,
    gstin: ctx.gstin,
    supportEmail: ctx.supportEmail,
  };
}

/**
 * Claims the automatic send for (booking, template, check-in). Returns the
 * claim row id, or null if it was already decided. Never re-claims: a send
 * that failed or whose outcome is unknown waits for staff, because the mail
 * service may already have delivered it.
 */
async function claim(
  admin: Admin,
  ctx: PropertyContext,
  b: SiteBooking,
  template: GuestEmailTemplate,
): Promise<string | null> {
  const { data, error } = await admin
    .from('villa_message_log')
    .insert({
      account_id: ctx.accountId,
      property_id: ctx.propertyId,
      site_booking_id: b.id,
      booking_code: b.bookingCode,
      template,
      check_in: template === 'pre_arrival' ? b.checkIn : null,
      status: 'sending',
      to_email: b.guestEmail || null,
    })
    .select('id')
    .single();

  if (!error) return data.id;
  if (error.code === '23505') return null;

  throw new Error(`claim failed: ${error.message}`);
}

/** Automatic rows already decided for these bookings (to skip site reads). */
async function decided(
  admin: Admin,
  propertyId: string,
  template: GuestEmailTemplate,
  bookingIds: string[],
): Promise<Set<string>> {
  if (bookingIds.length === 0) return new Set();

  const { data, error } = await admin
    .from('villa_message_log')
    .select('site_booking_id, check_in')
    .eq('property_id', propertyId)
    .eq('template', template)
    .eq('manual', false)
    .in('site_booking_id', bookingIds);

  if (error) throw new Error(`log read failed: ${error.message}`);

  return new Set(
    (data ?? []).map((r) => `${r.site_booking_id}|${r.check_in ?? ''}`),
  );
}

async function finish(
  admin: Admin,
  id: string,
  outcome: {
    status: 'sent' | 'skipped' | 'failed';
    reason?: string;
    providerId?: string;
  },
) {
  const write = () =>
    admin
      .from('villa_message_log')
      .update({
        status: outcome.status,
        reason: outcome.reason?.slice(0, 300) ?? null,
        provider_id: outcome.providerId ?? null,
      })
      .eq('id', id);

  // One retry: a row left at 'sending' shows staff "delivery unknown".
  const { error } = await write().then((r) => (r.error ? write() : r));

  if (error) {
    (await getLogger()).error(
      { id, code: error.code },
      'villa message log update failed',
    );
  }
}

/**
 * What the guest has actually paid, from Ooruda's own ledger (website
 * payments plus offline receipts, less refunds), with the status that follows
 * from it. netPaidPaise is 0 when nothing is receipted against the booking.
 */
async function ledgerFor(
  ctx: PropertyContext,
  b: SiteBooking,
): Promise<{ netPaidPaise: number; status: LedgerStatus }> {
  const admin = getSupabaseServerAdminClient();

  const [online, offline, refunds] = await Promise.all([
    // `b` came from this property's own booking list, so it is already scoped.
    listSitePayments(ctx.site, b.id, { verified: true }),
    admin
      .from('villa_booking_payments')
      .select('amount, voided_at')
      .eq('property_id', ctx.propertyId)
      .eq('site_booking_id', b.id),
    admin
      .from('villa_refunds')
      .select('amount, status')
      .eq('property_id', ctx.propertyId)
      .eq('site_booking_id', b.id),
  ]);

  if (offline.error || refunds.error) {
    return { netPaidPaise: 0, status: 'unpaid' };
  }

  const summary = summariseLedger({
    totalPaise: b.totalAmountPaise,
    bookingStatus: b.status,
    online: online.map((p) => ({
      amountPaise: p.amountPaise,
      status: p.status,
    })),
    offline: (offline.data ?? []).map((p) => ({
      amount: Number(p.amount),
      voided: Boolean(p.voided_at),
    })),
    refunds: (refunds.data ?? []).map((r) => ({
      amount: Number(r.amount),
      status: r.status,
    })),
  });

  return { netPaidPaise: summary.netPaidPaise, status: summary.status };
}

/**
 * How the guest actually paid, for the line beside the amount. A website
 * booking is settled through the payment gateway; a booking staff entered is
 * whatever they receipted it as. Null when nothing has been received, so the
 * line stays a bare "Paid <date>" rather than naming a method we are guessing.
 */
async function paymentMethodFor(
  ctx: PropertyContext,
  b: SiteBooking,
): Promise<{ method: string | null; paidOn: string | null }> {
  const online = await listSitePayments(ctx.site, b.id, { verified: true });

  if (online.length > 0) {
    // Latest settled payment: the one the email's paid line refers to.
    const latest = online.reduce<string | null>(
      (newest, p) =>
        p.createdAt && (!newest || p.createdAt > newest) ? p.createdAt : newest,
      null,
    );

    return { method: 'Razorpay', paidOn: latest };
  }

  const { data } = await getSupabaseServerAdminClient()
    .from('villa_booking_payments')
    .select('mode, paid_on')
    .eq('property_id', ctx.propertyId)
    .eq('site_booking_id', b.id)
    .is('voided_at', null)
    .order('paid_on', { ascending: false })
    .limit(1);

  const row = data?.[0];

  return {
    method: row?.mode ? paymentModeLabel(row.mode) : null,
    paidOn: row?.paid_on ?? null,
  };
}

/** Sends one email to the booking's guest. Never throws. */
export async function deliverGuestEmail(
  ctx: PropertyContext,
  b: SiteBooking,
  template: GuestEmailTemplate,
): Promise<{
  status: 'sent' | 'skipped' | 'failed';
  reason?: string;
  providerId?: string;
}> {
  const rawFrom = senderAddress();

  if (!b.guestEmail)
    return { status: 'skipped', reason: 'The booking has no guest email.' };

  const from = formatSenderAddress(ctx.name, rawFrom);
  const replyTo = ctx.supportEmail ?? replyToAddress() ?? undefined;

  // Only the confirmation prints a payment breakdown.
  const ledger =
    template === 'booking_confirmation'
      ? await ledgerFor(ctx, b).catch(() => undefined)
      : undefined;

  // Only the confirmation carries the "View your booking" button, and the
  // token is read on its own so it never travels with the booking object.
  // Neither lookup is allowed to stop the email: without them the button and
  // the payment method are simply left out.
  const site = siteBaseUrl();
  const [token, payment] =
    template === 'booking_confirmation'
      ? await Promise.all([
          site
            ? getBookingAccessToken(ctx.site, b.id).catch(() => null)
            : Promise.resolve(null),
          paymentMethodFor(ctx, b).catch(() => null),
        ])
      : [null, null];

  const { subject, html, text } = renderGuestEmail(
    template,
    contextFor(ctx, b, ledger, {
      bookingUrl: site && token ? `${site}/booking/${token}` : null,
      paymentMethod: payment?.method ?? null,
      paymentDate: payment?.paidOn ?? null,
    }),
  );

  try {
    const { providerId } = await sendVillaEmail({
      to: b.guestEmail,
      from,
      replyTo,
      subject,
      html,
      text,
    });

    return { status: 'sent', providerId };
  } catch (error) {
    (await getLogger()).error(
      {
        bookingId: b.id,
        template,
        error: error instanceof Error ? error.message : String(error),
      },
      'villa guest email failed',
    );
    return {
      status: 'failed',
      reason: 'The email service refused or did not answer.',
    };
  }
}

async function runPreArrival(admin: Admin, ctx: PropertyContext, now: Date) {
  const today = todayIst(now);

  // Live from the booking site (one call): a website booking made minutes
  // ago is included, and a cancelled or moved stay is already out.
  const upcoming = (
    await listBookings(ctx.site, today, addDays(today, 2))
  ).filter(
    (b) =>
      b.status === 'confirmed' &&
      b.checkIn >= today &&
      b.checkIn <= addDays(today, 1) &&
      isPreArrivalDue(b.checkIn, ctx.checkInTime, now),
  );

  const done = await decided(
    admin,
    ctx.propertyId,
    'pre_arrival',
    upcoming.map((b) => b.id),
  );

  for (const b of upcoming) {
    if (done.has(`${b.id}|${b.checkIn}`)) continue;

    const id = await claim(admin, ctx, b, 'pre_arrival');
    if (!id) continue;

    await finish(admin, id, await deliverGuestEmail(ctx, b, 'pre_arrival'));
  }
}

async function runThankYou(admin: Admin, ctx: PropertyContext, now: Date) {
  const since = new Date(
    now.getTime() - THANK_YOU_WINDOW_DAYS * 24 * 3_600_000,
  ).toISOString();

  // Check-outs pressed in the last week, and any undo that followed.
  const { data: events, error } = await admin
    .from('villa_booking_activity')
    .select('site_booking_id, action, created_at')
    .eq('property_id', ctx.propertyId)
    .in('action', ['completed', 'reopened'])
    .gte('created_at', since)
    .order('created_at');

  if (error) throw new Error(`thank-you candidates failed: ${error.message}`);

  // Latest event per booking: only a check-out not undone since counts.
  const latest = new Map<string, { action: string; at: Date }>();
  for (const e of events ?? []) {
    latest.set(e.site_booking_id, {
      action: e.action,
      at: new Date(e.created_at),
    });
  }

  const due = [...latest]
    .filter(
      ([, last]) => last.action === 'completed' && isThankYouDue(last.at, now),
    )
    .map(([id]) => id);
  const done = await decided(admin, ctx.propertyId, 'thank_you', due);

  for (const bookingId of due) {
    if (done.has(`${bookingId}|`)) continue;

    const b = await getBooking(ctx.site, bookingId);
    if (!b || b.status !== 'completed') continue;

    const id = await claim(admin, ctx, b, 'thank_you');
    if (!id) continue;

    await finish(admin, id, await deliverGuestEmail(ctx, b, 'thank_you'));
  }
}

/** Loads a property's email context (for a manual send). */
export async function loadGuestEmailContext(
  accountId: string,
  propertyId: string,
) {
  const admin = getSupabaseServerAdminClient();
  // Use server client (RLS) for the property read; admin is passed to
  // loadContext for privileged lookups (emergency contacts, etc.).
  const { data: p, error } = await getSupabaseServerClient()
    .from('villa_properties')
    .select(EMAIL_PROPERTY_COLUMNS)
    .eq('id', propertyId)
    .eq('account_id', accountId)
    .single();

  if (error) throw new Error('Could not load the villa.');

  return loadContext(admin, p);
}

/** Dashboard-triggered runs, at most this often per account. */
const DASHBOARD_THROTTLE_MS = 5 * 60_000;
/** The scheduled run stops starting new villas after this long. */
const RUN_BUDGET_MS = 120_000;

export async function runDueGuestEmails(
  accountId?: string,
  now: Date = new Date(),
): Promise<{ villas: number; failed: number }> {
  const admin = getSupabaseServerAdminClient();
  const logger = await getLogger();
  const started = Date.now();

  if (!senderAddress()) {
    logger.warn('villa guest emails: VILLA_EMAIL_FROM not set, nothing sent');
    return { villas: 0, failed: 0 };
  }

  // A dashboard visit runs this for its own account; don't hit the booking
  // site on every visit. Claim the slot with a conditional update.
  if (accountId) {
    const cutoff = new Date(
      now.getTime() - DASHBOARD_THROTTLE_MS,
    ).toISOString();
    await admin
      .from('villa_account_settings')
      .upsert(
        { account_id: accountId },
        { onConflict: 'account_id', ignoreDuplicates: true },
      );
    const { data: slot } = await admin
      .from('villa_account_settings')
      .update({ guest_emails_checked_at: now.toISOString() })
      .eq('account_id', accountId)
      .or(
        `guest_emails_checked_at.is.null,guest_emails_checked_at.lt.${cutoff}`,
      )
      .select('account_id');

    if (!slot?.length) return { villas: 0, failed: 0 };
  }

  let query = admin
    .from('villa_properties')
    .select(EMAIL_PROPERTY_COLUMNS)
    .eq('status', 'active')
    .not('site_property_id', 'is', null);
  let settingsQuery = admin
    .from('villa_account_settings')
    .select('account_id, pre_arrival_email, thank_you_email');

  if (accountId) {
    query = query.eq('account_id', accountId);
    settingsQuery = settingsQuery.eq('account_id', accountId);
  }

  const [
    { data: properties, error },
    { data: settings, error: settingsError },
  ] = await Promise.all([query, settingsQuery]);

  if (error || settingsError) {
    logger.error(
      { error: (error ?? settingsError)!.message },
      'villa guest emails: load failed',
    );
    return { villas: 0, failed: 1 };
  }

  const switches = new Map((settings ?? []).map((s) => [s.account_id, s]));
  let failed = 0;

  for (const p of properties ?? []) {
    if (Date.now() - started > RUN_BUDGET_MS) break;

    const on = switches.get(p.account_id);
    const preArrival = on?.pre_arrival_email ?? false;
    const thankYou = on?.thank_you_email ?? false;

    if (!preArrival && !thankYou) continue;

    try {
      const ctx = await loadContext(admin, p, { system: true });
      if (preArrival) await runPreArrival(admin, ctx, now);
      if (thankYou) await runThankYou(admin, ctx, now);
    } catch (e) {
      failed++;
      logger.error(
        { propertyId: p.id, error: e instanceof Error ? e.message : String(e) },
        'villa guest emails: run failed for a villa',
      );
    }
  }

  return { villas: properties?.length ?? 0, failed };
}

/**
 * "Send now" / "Send again" from the booking page. Recorded as a manual row;
 * it never blocks or replaces the automatic one. The caller has authorised
 * the villa role and passes the booking as just read from the site.
 */
export async function sendGuestEmailNow(
  accountId: string,
  propertyId: string,
  booking: SiteBooking,
  template: GuestEmailTemplate,
  actor: string,
) {
  const allowed =
    template === 'booking_confirmation'
      ? booking.status === 'confirmed' || booking.status === 'completed'
      : template === 'pre_arrival'
        ? booking.status === 'confirmed' && booking.checkIn >= todayIst()
        : booking.status === 'completed';

  if (!allowed) {
    throw new Error(
      template === 'booking_confirmation'
        ? 'The confirmation email is only for a confirmed or completed stay.'
        : template === 'pre_arrival'
          ? 'The arrival email is only for a confirmed, upcoming stay.'
          : 'The thank-you email goes only after check-out.',
    );
  }

  if (!booking.guestEmail) throw new Error('The booking has no guest email.');

  const admin = getSupabaseServerAdminClient();

  // The same rule the button applies, enforced here: the confirmation quotes
  // a refund ladder, so it goes only once money has been received. The other
  // two emails quote nothing and are unaffected.
  if (
    template === 'booking_confirmation' &&
    !(await hasRecordedPayment(
      admin,
      await getVillaSite(accountId, propertyId),
      propertyId,
      booking,
    ))
  ) {
    throw new Error(
      'Record the advance payment first - the confirmation email states what would be refunded.',
    );
  }

  const ctx = await loadGuestEmailContext(accountId, propertyId);

  const { data: row, error } = await admin
    .from('villa_message_log')
    .insert({
      account_id: accountId,
      property_id: propertyId,
      site_booking_id: booking.id,
      booking_code: booking.bookingCode,
      template,
      manual: true,
      status: 'sending',
      to_email: booking.guestEmail,
      sent_by: actor,
    })
    .select('id')
    .single();

  if (error) throw new Error('Could not send the email. Please try again.');

  const outcome = await deliverGuestEmail(ctx, booking, template);
  await finish(admin, row.id, outcome);

  if (outcome.status !== 'sent') {
    throw new Error(outcome.reason ?? 'Could not send the email.');
  }

  const templateLabel = GUEST_EMAIL_LABELS[template] ?? template;
  await recordBookingActivity(
    {
      accountId,
      propertyId,
      booking: { id: booking.id, bookingCode: booking.bookingCode },
      action: 'email_sent',
      note: `${templateLabel} email sent manually to ${booking.guestEmail}`,
    },
    actor,
  );
}

/**
 * Sends a booking confirmation email immediately after a manual booking is
 * created. Logs to villa_message_log; never throws — a failed send is
 * recorded and shown to staff on the booking page, who can resend manually.
 *
 * Skips silently when the booking has no guest email.
 */
export async function sendBookingConfirmation(
  accountId: string,
  propertyId: string,
  booking: SiteBooking,
): Promise<void> {
  if (!senderAddress()) return;
  if (!booking.guestEmail) return;

  const admin = getSupabaseServerAdminClient();

  // Check the account toggle.
  const { data: settings } = await admin
    .from('villa_account_settings')
    .select('booking_confirmation_email')
    .eq('account_id', accountId)
    .maybeSingle();

  if (settings?.booking_confirmation_email === false) return;

  // Nothing received yet: the booking is real, but the confirmation is not
  // sent. It quotes a cancellation ladder in rupees, and promising a refund
  // to a guest who has paid nothing - in writing, under the company's CIN and
  // GSTIN - is the one thing this email must never do. Recorded as a skipped
  // row rather than dropped, so the booking page can say why and staff can
  // send it by hand once the advance is in.
  //
  // The ledger spans both databases, so the context (which holds the site
  // connection) is loaded first and reused for the check.
  const ctx = await loadGuestEmailContext(accountId, propertyId);
  const paid = await hasRecordedPayment(admin, ctx.site, propertyId, booking);

  const { data: row, error } = await admin
    .from('villa_message_log')
    .insert({
      account_id: accountId,
      property_id: propertyId,
      site_booking_id: booking.id,
      booking_code: booking.bookingCode,
      template: 'booking_confirmation' as const,
      manual: false,
      status: paid ? 'sending' : 'skipped',
      reason: paid ? null : NO_PAYMENT_REASON,
      to_email: booking.guestEmail,
    })
    .select('id')
    .single();

  if (error) {
    (await getLogger()).error(
      { bookingId: booking.id, code: error.code },
      'villa booking confirmation: log insert failed',
    );
    return;
  }

  if (!paid) return;

  const outcome = await deliverGuestEmail(ctx, booking, 'booking_confirmation');
  await finish(admin, row.id, outcome);

  if (outcome.status === 'sent') {
    await recordBookingActivity(
      {
        accountId,
        propertyId,
        booking: { id: booking.id, bookingCode: booking.bookingCode },
        action: 'email_sent',
        note: `Booking confirmation email sent automatically to ${booking.guestEmail}`,
      },
      null,
    );
  }
}
