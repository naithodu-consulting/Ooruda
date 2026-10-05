import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getMailer } from '@kit/mailers';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import type { Database } from '~/lib/database.types';
import {
  type SiteBooking,
  getBooking,
  listBookings,
} from '~/lib/villa-db/bookings';
import { type VillaSite, getVillaSite } from '~/lib/villa-db/client';
import { addDays, todayIst } from '~/lib/villa-db/dates';
import { getBaseRates } from '~/lib/villa-db/rates';

import {
  type GuestEmailContext,
  type GuestEmailTemplate,
  isPreArrivalDue,
  isThankYouDue,
  renderGuestEmail,
  THANK_YOU_WINDOW_DAYS,
} from './guest-emails';
import { contactCategoryLabel } from './labels';

/**
 * Sends the automatic guest emails that are due (guest-emails.ts has the
 * rules). Every booking is re-read LIVE from the booking site right before
 * its email goes: a cancellation or date change since the last sync stops
 * it. Each automatic email is claimed in villa_message_log before sending,
 * so two runs at once never send it twice.
 *
 * Runs from the scheduled route and on villa dashboard visits.
 */

/** The booking site's sender (plan decision): set per deployment. */
function senderAddress(): string | null {
  const from = process.env.VILLA_EMAIL_FROM?.trim();
  return from ? from : null;
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
}

async function loadContext(
  admin: Admin,
  p: {
    id: string;
    account_id: string;
    name: string;
    whatsapp_number: string | null;
  },
): Promise<PropertyContext> {
  const site = await getVillaSite(p.account_id, p.id);
  const [rates, { data: contacts, error }] = await Promise.all([
    getBaseRates(site),
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
    whatsApp: p.whatsapp_number,
    site,
    checkInTime: rates.checkInTime,
    checkOutTime: rates.checkOutTime,
    contacts: (contacts ?? []).map((c) => ({
      name: c.name,
      role: contactCategoryLabel(c.category),
      phone: c.phone,
    })),
  };
}

function contextFor(ctx: PropertyContext, b: SiteBooking): GuestEmailContext {
  return {
    villaName: ctx.name,
    guestName: b.guestName,
    bookingCode: b.bookingCode,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    checkInTime: ctx.checkInTime,
    checkOutTime: ctx.checkOutTime,
    adults: b.adults,
    whatsApp: ctx.whatsApp,
    contacts: ctx.contacts,
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
  const from = senderAddress();

  if (!from)
    return {
      status: 'failed',
      reason: 'No sender address set (VILLA_EMAIL_FROM).',
    };
  if (!b.guestEmail)
    return { status: 'skipped', reason: 'The booking has no guest email.' };

  const { subject, html } = renderGuestEmail(template, contextFor(ctx, b));

  try {
    const result = await (
      await getMailer()
    ).sendEmail({
      to: b.guestEmail,
      from,
      subject,
      html,
    });
    const providerId =
      result && typeof result === 'object' && 'id' in result
        ? String((result as { id: unknown }).id)
        : undefined;

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
  const { data: p, error } = await admin
    .from('villa_properties')
    .select('id, account_id, name, whatsapp_number')
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
    .select('id, account_id, name, whatsapp_number')
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
    const preArrival = on?.pre_arrival_email ?? true;
    const thankYou = on?.thank_you_email ?? true;

    if (!preArrival && !thankYou) continue;

    try {
      const ctx = await loadContext(admin, p);
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
    template === 'pre_arrival'
      ? booking.status === 'confirmed' && booking.checkIn >= todayIst()
      : booking.status === 'completed';

  if (!allowed) {
    throw new Error(
      template === 'pre_arrival'
        ? 'The arrival email is only for a confirmed, upcoming stay.'
        : 'The thank-you email goes only after check-out.',
    );
  }

  if (!booking.guestEmail) throw new Error('The booking has no guest email.');

  const admin = getSupabaseServerAdminClient();
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
}
