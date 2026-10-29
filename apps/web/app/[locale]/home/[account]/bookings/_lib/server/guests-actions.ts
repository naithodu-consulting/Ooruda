'use server';

import { revalidatePath } from 'next/cache';

import { authActionClient } from '@kit/next/safe-action';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { requireVillaRole } from '~/lib/villa/auth';

import {
  AddGuestSchema,
  DeleteIdSchema,
  IdStatusSchema,
  MarkDocVerifiedSchema,
  RecordIdSchema,
  RemoveGuestSchema,
} from '../schemas/guests.schema';
import { createGuestsService } from './guests.service';

const STAFF = ['villa_admin', 'villa_manager'] as const;

function revalidateBooking() {
  revalidatePath('/[locale]/home/[account]/bookings/[bookingId]', 'page');
}

const service = () => createGuestsService(getSupabaseServerClient());

export const addGuestAction = authActionClient
  .inputSchema(AddGuestSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireVillaRole(parsedInput.accountId, STAFF);
    const result = await service().addGuest(parsedInput, ctx.user.id);
    revalidateBooking();
    return result;
  });

export const removeGuestAction = authActionClient
  .inputSchema(RemoveGuestSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireVillaRole(parsedInput.accountId, STAFF);
    await service().removeGuest(parsedInput, ctx.user.id);
    revalidateBooking();
  });

// IDs seen in person (no file). Files go through the upload route, which
// shares the schema and the service.
export const recordIdSeenAction = authActionClient
  .inputSchema(RecordIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireVillaRole(parsedInput.accountId, STAFF);

    if (parsedInput.stage !== 'seen_in_person') {
      throw new Error('Attach the ID photo to store a copy.');
    }

    const result = await service().recordId(parsedInput, [], ctx.user.id);
    revalidateBooking();
    return result;
  });

export const setIdStatusAction = authActionClient
  .inputSchema(IdStatusSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireVillaRole(parsedInput.accountId, STAFF);
    await service().setStatus(parsedInput, ctx.user.id);
    revalidateBooking();
  });

// Deleting a guest's ID before its retention date. Open to managers as well
// as admins: a manager who can already view and download the scans is the
// person at the desk when a guest asks for them to be removed, and the
// deletion is logged against them either way.
export const deleteIdAction = authActionClient
  .inputSchema(DeleteIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireVillaRole(parsedInput.accountId, STAFF);
    await service().deleteId(parsedInput, ctx.user.id);
    revalidateBooking();
  });

// Mark a single ID document as checked (staff verified it against the guest).
export const markDocVerifiedAction = authActionClient
  .inputSchema(MarkDocVerifiedSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireVillaRole(parsedInput.accountId, STAFF);
    await service().markDocVerified(parsedInput, ctx.user.id);
    revalidateBooking();
  });
