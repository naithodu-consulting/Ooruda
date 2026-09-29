'use server';

import { revalidatePath } from 'next/cache';

import { authActionClient } from '@kit/next/safe-action';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { requireVillaRole } from '~/lib/villa/auth';

import {
  CancelBookingSchema,
  CompleteStaySchema,
  NewBookingSchema,
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
      'villa_owner',
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
      'villa_owner',
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
      'villa_owner',
      'villa_manager',
    ]);

    await createBookingsService(getSupabaseServerClient()).complete(
      parsedInput,
      ctx.user.id,
    );

    revalidateBookings();
  });
