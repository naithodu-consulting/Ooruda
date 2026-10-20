'use server';

import { revalidatePath } from 'next/cache';

import { authActionClient } from '@kit/next/safe-action';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { requireVillaRole } from '~/lib/villa/auth';

import {
  RecordPaymentSchema,
  RecordRefundSchema,
  VoidPaymentSchema,
} from '../schemas/payments.schema';
import { createPaymentsService } from './payments.service';

function revalidateBooking() {
  revalidatePath('/[locale]/home/[account]/bookings/[bookingId]', 'page');
  revalidatePath('/[locale]/home/[account]/bookings', 'page');
}

const service = () => createPaymentsService(getSupabaseServerClient());

// Owners and managers take payments.
export const recordPaymentAction = authActionClient
  .inputSchema(RecordPaymentSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireVillaRole(parsedInput.accountId, [
      'villa_admin',
      'villa_manager',
    ]);
    const result = await service().record(parsedInput, ctx.user.id);
    revalidateBooking();
    return result;
  });

// Owner only (also enforced in the database function).
export const voidPaymentAction = authActionClient
  .inputSchema(VoidPaymentSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireVillaRole(parsedInput.accountId, ['villa_admin']);
    await service().void(parsedInput, ctx.user.id);
    revalidateBooking();
  });

// Owner only: refunds stay with the owner (plan §9b).
export const recordRefundAction = authActionClient
  .inputSchema(RecordRefundSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireVillaRole(parsedInput.accountId, ['villa_admin']);
    const result = await service().refund(parsedInput, ctx.user.id);
    revalidateBooking();
    return result;
  });
