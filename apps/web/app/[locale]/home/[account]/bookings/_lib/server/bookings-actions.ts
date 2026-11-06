'use server';

import { revalidatePath } from 'next/cache';

import { authActionClient } from '@kit/next/safe-action';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { getBooking } from '~/lib/villa-db/bookings';
import { getVillaSite } from '~/lib/villa-db/client';
import { requireVillaRole } from '~/lib/villa/auth';
import { sendGuestEmailNow } from '~/lib/villa/guest-email-runner';

import {
  CancelBookingSchema,
  CheckInStaySchema,
  CompleteStaySchema,
  EnrichChannelStaySchema,
  NewBookingSchema,
  ReopenStaySchema,
  SendGuestEmailSchema,
  UpdateBookingSchema,
  AdjustBookingMoneySchema,
  VoidEnrichmentSchema,
  ChangeBookingDatesSchema,
} from '../schemas/bookings.schema';
import { createBookingsService } from './bookings.service';

function revalidateBookings() {
  revalidatePath('/[locale]/home/[account]/bookings', 'layout');
  revalidatePath('/[locale]/home/[account]', 'page');
}

// Owners and managers take bookings and check guests out.
export const createBookingAction = authActionClient
  .inputSchema(NewBookingSchema)
  .action(async ({ parsedInput, ctx }) => {
    const role = await requireVillaRole(parsedInput.accountId, [
      'villa_admin',
      'villa_manager',
    ]);

    // The role decides whether a cutoff override is allowed: the service
    // honours it for villa_admin only.
    const booking = await createBookingsService(
      getSupabaseServerClient(),
    ).create(parsedInput, ctx.user.id, role);

    revalidateBookings();

    return { id: booking.id, bookingCode: booking.bookingCode };
  });

// Filling in a stay a booking channel sold. Same people who take bookings:
// it records what already happened on the channel and sells nothing.
export const enrichChannelStayAction = authActionClient
  .inputSchema(EnrichChannelStaySchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireVillaRole(parsedInput.accountId, [
      'villa_admin',
      'villa_manager',
    ]);

    const booking = await createBookingsService(
      getSupabaseServerClient(),
    ).enrichChannelStay(parsedInput, ctx.user.id);

    revalidateBookings();
    revalidatePath('/[locale]/home/[account]/calendar', 'page');
    revalidatePath('/[locale]/home/[account]/blocked-dates', 'page');

    return { id: booking.id, bookingCode: booking.bookingCode };
  });

/**
 * Correcting a booking's guest details. Same people who take bookings: it
 * fixes who is staying, not what they owe, and a misspelt name on a
 * registration card is a front-desk problem.
 */
export const updateBookingAction = authActionClient
  .inputSchema(UpdateBookingSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireVillaRole(parsedInput.accountId, [
      'villa_admin',
      'villa_manager',
    ]);

    const { changes, auditWritten } = await createBookingsService(
      getSupabaseServerClient(),
    ).updateGuestDetails(parsedInput, ctx.user.id);

    revalidateBookings();
    revalidatePath('/[locale]/home/[account]/bookings/[bookingId]', 'page');
    // The guest name shows on the calendar and the blocked-dates list.
    revalidatePath('/[locale]/home/[account]/calendar', 'page');

    return { changedFields: changes.length, auditWritten };
  });

/**
 * Adjusting what a booking comes to.
 *
 * Admin only, unlike correcting guest details: this moves the villa's revenue
 * and what the guest owes.
 */
export const adjustBookingMoneyAction = authActionClient
  .inputSchema(AdjustBookingMoneySchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireVillaRole(parsedInput.accountId, ['villa_admin']);

    const { changes, auditWritten } = await createBookingsService(
      getSupabaseServerClient(),
    ).adjustMoney(parsedInput, ctx.user.id);

    revalidateBookings();
    revalidatePath('/[locale]/home/[account]/bookings/[bookingId]', 'page');
    // Revenue and the cash position both read this booking's total.
    revalidatePath('/[locale]/home/[account]/villa-reports', 'page');

    return { changedFields: changes.length, auditWritten };
  });

/**
 * Moving a booking to different nights (edit booking Phase 3).
 *
 * villa_admin only, like the other two edit phases: a move re-prices the stay
 * and can change what the guest owes.
 *
 * Revalidates the calendar as well as the bookings pages — the whole point of
 * a move is that different nights are now occupied.
 */
export const changeBookingDatesAction = authActionClient
  .inputSchema(ChangeBookingDatesSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireVillaRole(parsedInput.accountId, ['villa_admin']);

    const { auditWritten } = await createBookingsService(
      getSupabaseServerClient(),
    ).changeDates(parsedInput, ctx.user.id);

    revalidateBookings();
    revalidatePath('/[locale]/home/[account]/bookings/[bookingId]', 'page');
    revalidatePath('/[locale]/home/[account]/calendar', 'page');
    // The stay may have moved into another month, and its price with it.
    revalidatePath('/[locale]/home/[account]/villa-reports', 'page');

    return { auditWritten };
  });

/**
 * Retiring a channel stay filled in by mistake, money included.
 *
 * Admin only, and not delegated to managers the way cancelling can be: this
 * voids a receipt and deletes an expense, so it moves the villa's numbers.
 */
export const voidEnrichmentAction = authActionClient
  .inputSchema(VoidEnrichmentSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireVillaRole(parsedInput.accountId, ['villa_admin']);

    const { outcome, auditWritten } = await createBookingsService(
      getSupabaseServerClient(),
    ).voidEnrichment(parsedInput, ctx.user.id);

    revalidateBookings();
    revalidatePath('/[locale]/home/[account]/bookings/[bookingId]', 'page');
    // The nights come back on the calendar, and Reports loses the payout.
    revalidatePath('/[locale]/home/[account]/calendar', 'page');
    revalidatePath('/[locale]/home/[account]/blocked-dates', 'page');
    revalidatePath('/[locale]/home/[account]/villa-reports', 'page');

    return { outcome, auditWritten };
  });

// Owners always; managers only when the owner allowed it (checked in the
// service against villa_account_settings.managers_can_cancel).
export const cancelBookingAction = authActionClient
  .inputSchema(CancelBookingSchema)
  .action(async ({ parsedInput, ctx }) => {
    const role = await requireVillaRole(parsedInput.accountId, [
      'villa_admin',
      'villa_manager',
    ]);

    await createBookingsService(getSupabaseServerClient()).cancel(
      parsedInput,
      role,
      ctx.user.id,
    );

    revalidateBookings();
  });

export const checkInStayAction = authActionClient
  .inputSchema(CheckInStaySchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireVillaRole(parsedInput.accountId, [
      'villa_admin',
      'villa_manager',
    ]);

    await createBookingsService(getSupabaseServerClient()).checkIn(
      parsedInput,
      ctx.user.id,
    );

    revalidateBookings();
    revalidatePath('/[locale]/home/[account]/bookings/[bookingId]', 'page');
    revalidatePath('/[locale]/home/[account]', 'page');
  });

export const completeStayAction = authActionClient
  .inputSchema(CompleteStaySchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireVillaRole(parsedInput.accountId, [
      'villa_admin',
      'villa_manager',
    ]);

    await createBookingsService(getSupabaseServerClient()).complete(
      parsedInput,
      ctx.user.id,
    );

    revalidateBookings();
    revalidatePath('/[locale]/home/[account]/bookings/[bookingId]', 'page');
  });

export const reopenStayAction = authActionClient
  .inputSchema(ReopenStaySchema)
  .action(async ({ parsedInput, ctx }) => {
    // Admin only: undoing a check-out re-opens a stay and re-arms the thank-you
    // email, so it is not a front-desk action.
    await requireVillaRole(parsedInput.accountId, ['villa_admin']);

    await createBookingsService(getSupabaseServerClient()).reopen(
      parsedInput,
      ctx.user.id,
    );

    revalidateBookings();
  });

// "Send now" / "Send again" for a guest email.
export const sendGuestEmailAction = authActionClient
  .inputSchema(SendGuestEmailSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireVillaRole(parsedInput.accountId, [
      'villa_admin',
      'villa_manager',
    ]);

    const client = getSupabaseServerClient();

    // Verify whether this email template is enabled in account settings.
    const { data: settings, error: settingsError } = await client
      .from('villa_account_settings')
      .select('booking_confirmation_email, pre_arrival_email, thank_you_email')
      .eq('account_id', parsedInput.accountId)
      .maybeSingle();

    if (settingsError) {
      throw new Error('Could not verify email settings. Please try again.');
    }

    const enabled =
      parsedInput.template === 'booking_confirmation'
        ? (settings?.booking_confirmation_email ?? true)
        : parsedInput.template === 'pre_arrival'
          ? (settings?.pre_arrival_email ?? false)
          : (settings?.thank_you_email ?? false);

    if (!enabled) {
      throw new Error('This guest email is switched off in Villa Settings.');
    }

    const site = await getVillaSite(
      parsedInput.accountId,
      parsedInput.propertyId,
    );
    const booking = await getBooking(site, parsedInput.bookingId);

    if (!booking) throw new Error('That booking no longer exists.');

    await sendGuestEmailNow(
      parsedInput.accountId,
      parsedInput.propertyId,
      booking,
      parsedInput.template,
      ctx.user.id,
    );

    revalidateBookings();
  });
