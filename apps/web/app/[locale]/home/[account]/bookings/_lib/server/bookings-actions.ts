'use server';

import { revalidatePath } from 'next/cache';

import { authActionClient } from '@kit/next/safe-action';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { getBooking } from '~/lib/villa-db/bookings';
import { getVillaSite } from '~/lib/villa-db/client';
import { requireVillaRole } from '~/lib/villa/auth';
import { manualGuestEmailsEnabled } from '~/lib/villa/flags';
import { sendGuestEmailNow } from '~/lib/villa/guest-email-runner';

import {
  CancelBookingSchema,
  CompleteStaySchema,
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
    await requireVillaRole(parsedInput.accountId, [
      'villa_admin',
      'villa_manager',
    ]);

    const booking = await createBookingsService(
      getSupabaseServerClient(),
    ).create(parsedInput, ctx.user.id);

    revalidateBookings();

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

    if (!manualGuestEmailsEnabled()) {
      throw new Error(
        'Sending guest emails by hand is switched off for now. Automatic emails are not affected.',
      );
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
