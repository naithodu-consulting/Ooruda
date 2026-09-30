import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import type * as z from 'zod';

import type { Database } from '~/lib/database.types';
import { addDays } from '~/lib/villa-db/dates';

import type {
  DiscountReviewSchema,
  DiscountSchema,
  DiscountToggleSchema,
} from '../schemas/villa-discounts.schema';

type Client = SupabaseClient<Database>;

function fromDb(error: { code?: string; message: string }): Error {
  if (error.code === '23505')
    return new Error('That code already exists for this villa.');
  if (error.code === '42501' || error.code === '22023')
    return new Error(error.message);
  if (error.code === '23514') return new Error('Check the discount terms.');
  return new Error('Could not save the code. Please try again.');
}

/**
 * Discount codes. All writes are database functions that check the role
 * themselves (owner to define, Ooruda super-admin to approve over 25%), so
 * this service only shapes the input.
 */
export function createVillaDiscountsService(client: Client) {
  return {
    async save(input: z.output<typeof DiscountSchema>) {
      const { data, error } = await client.rpc('save_villa_discount', {
        p_id: (input.id || null) as string,
        p_property_id: input.propertyId,
        p_code: input.code,
        p_discount_type: input.discountType,
        p_discount_value: input.discountValue,
        p_max_discount: (input.maxDiscount === ''
          ? null
          : input.maxDiscount) as number,
        p_valid_from: input.validFrom,
        p_valid_to: input.validTo,
        p_min_nights: input.minNights,
        p_min_booking_value: input.minBookingValue,
        p_max_uses: (input.maxUses === '' ? null : input.maxUses) as number,
        p_max_uses_per_guest: input.maxUsesPerGuest,
        // People pick the last blocked NIGHT; stored end-exclusive.
        p_blackouts: input.blackouts.map((b) => ({
          start: b.start,
          end: addDays(b.lastNight, 1),
        })),
        p_note: input.note,
      });

      if (error) throw fromDb(error);

      return { status: data.status };
    },

    async toggle(input: z.output<typeof DiscountToggleSchema>) {
      const { error } = await client.rpc('set_villa_discount_active', {
        p_id: input.id,
        p_active: input.active,
      });

      if (error) throw fromDb(error);
    },

    async review(input: z.output<typeof DiscountReviewSchema>) {
      const { error } = await client.rpc('review_villa_discount', {
        p_id: input.id,
        p_approve: input.approve,
      });

      if (error) throw fromDb(error);
    },
  };
}
