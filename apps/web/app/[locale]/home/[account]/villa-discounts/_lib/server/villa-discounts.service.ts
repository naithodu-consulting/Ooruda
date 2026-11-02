import 'server-only';
import { after } from 'next/server';

import type { SupabaseClient } from '@supabase/supabase-js';

import type * as z from 'zod';

import { getLogger } from '@kit/shared/logger';

import type { Database } from '~/lib/database.types';
import { getVillaSite } from '~/lib/villa-db/client';
import { addDays } from '~/lib/villa-db/dates';

import type {
  DiscountArchiveSchema,
  DiscountReviewSchema,
  DiscountSchema,
  DiscountToggleSchema,
} from '../schemas/villa-discounts.schema';

type Client = SupabaseClient<Database>;

/**
 * Push the current state of a discount code to the villa-booking DB mirror.
 * Failures are logged but never propagate — Ooruda is the source of truth;
 * the booking site will simply miss the code until the next successful sync.
 */
async function syncDiscountCode(
  client: Client,
  discountId: string,
): Promise<void> {
  const logger = await getLogger();
  try {
    const { data: row } = await client
      .from('villa_discount_codes')
      .select(
        'id, account_id, property_id, code, discount_type, discount_value, max_discount, valid_from, valid_to, min_nights, min_booking_value, max_uses, max_uses_per_guest, blackouts, status',
      )
      .eq('id', discountId)
      .single();

    if (!row) return;

    const site = await getVillaSite(row.account_id, row.property_id);
    const isActive = row.status === 'active';
    const siteDb = site.client;

    if (isActive) {
      const { error } = await siteDb.from('discount_codes').upsert(
        {
          id: row.id,
          property_id: site.sitePropertyId,
          code: row.code,
          discount_type: row.discount_type,
          discount_value: row.discount_value,
          max_discount: row.max_discount ?? null,
          valid_from: row.valid_from,
          valid_to: row.valid_to,
          min_nights: row.min_nights,
          min_booking_value: row.min_booking_value,
          max_uses: row.max_uses ?? null,
          max_uses_per_guest: row.max_uses_per_guest,
          blackouts: row.blackouts ?? [],
          is_active: true,
        },
        { onConflict: 'id' },
      );
      if (error)
        logger.warn(
          { discountId: row.id, error: error.message },
          'villa discount sync upsert failed',
        );
    } else {
      const { error } = await siteDb
        .from('discount_codes')
        .delete()
        .eq('id', row.id);
      if (error)
        logger.warn(
          { discountId: row.id, error: error.message },
          'villa discount sync delete failed',
        );
    }
  } catch (err) {
    logger.warn(
      { discountId, error: String(err) },
      'villa discount sync to booking site failed',
    );
  }
}

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
        p_min_nights: (input.minNights === '' ? 1 : input.minNights) as number,
        p_min_booking_value: (input.minBookingValue === ''
          ? 0
          : input.minBookingValue) as number,
        p_max_uses: (input.maxUses === '' ? null : input.maxUses) as number,
        p_max_uses_per_guest: (input.maxUsesPerGuest === ''
          ? 1
          : input.maxUsesPerGuest) as number,
        // People pick the last blocked NIGHT; stored end-exclusive.
        p_blackouts: input.blackouts.map((b) => ({
          start: b.start,
          end: addDays(b.lastNight, 1),
        })),
        p_note: input.note,
      });

      if (error) throw fromDb(error);

      // Fire-and-forget: sync new/updated code to the booking site
      if (data?.id) {
        const id = (data as { id: string }).id;
        after(() => syncDiscountCode(client, id));
      }

      return { status: data.status };
    },

    async toggle(input: z.output<typeof DiscountToggleSchema>) {
      const { error } = await client.rpc('set_villa_discount_active', {
        p_id: input.id,
        p_active: input.active,
      });

      if (error) throw fromDb(error);

      // Fire-and-forget: sync to booking site
      after(() => syncDiscountCode(client, input.id));
    },

    /**
     * Retire a code for good.
     *
     * The booking site is cleared FIRST, and only then is the code archived
     * here. Every other write syncs in the background and shrugs off a
     * failure, because it can be retried by saving, pausing or resuming the
     * code again. Archiving is irreversible and closes all three of those
     * paths, so a swallowed failure would leave the code live at checkout
     * for ever while the screen said "Archived" — a discount nobody can
     * withdraw. In this order the worst case is the harmless one: the code
     * is gone from the site but still shows as active here, and archiving
     * again finishes the job.
     */
    async archive(input: z.output<typeof DiscountArchiveSchema>) {
      const { data: row, error: readError } = await client
        .from('villa_discount_codes')
        .select('id, account_id, property_id, status')
        .eq('id', input.id)
        .single();

      if (readError || !row) throw new Error('That code no longer exists.');

      if (row.status !== 'archived') {
        try {
          const site = await getVillaSite(row.account_id, row.property_id);

          const { error } = await site.client
            .from('discount_codes')
            .delete()
            .eq('id', row.id);

          if (error) throw new Error(error.message);
        } catch (err) {
          (await getLogger()).error(
            { discountId: row.id, error: String(err) },
            'villa discount archive could not clear the booking site',
          );

          throw new Error(
            'Could not remove the code from your website, so it has not been archived. Please try again in a moment.',
          );
        }
      }

      const { error } = await client.rpc('archive_villa_discount', {
        p_id: input.id,
      });

      if (error) throw fromDb(error);
    },

    async review(input: z.output<typeof DiscountReviewSchema>) {
      const { error } = await client.rpc('review_villa_discount', {
        p_id: input.id,
        p_approve: input.approve,
      });

      if (error) throw fromDb(error);

      // Fire-and-forget: sync to booking site
      after(() => syncDiscountCode(client, input.id));
    },
  };
}
