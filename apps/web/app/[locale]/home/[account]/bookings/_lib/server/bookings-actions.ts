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
  CompleteStaySchema,
  EnrichChannelStaySchema,
  NewBookingSchema,
  ReopenStaySchema,
  SendGuestEmailSchema,
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
