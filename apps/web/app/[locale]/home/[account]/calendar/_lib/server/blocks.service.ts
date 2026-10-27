import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import type * as z from 'zod';

import type { Database } from '~/lib/database.types';
import { createBlock, releaseFromBlock } from '~/lib/villa-db/blocks';
import { getVillaSite } from '~/lib/villa-db/client';
import { endAfterLastNight, todayIst } from '~/lib/villa-db/dates';
import { VillaDbError } from '~/lib/villa-db/errors';

import type {
  CreateBlockSchema,
  ReleaseBlockSchema,
} from '../schemas/blocks.schema';

function assertNotPast(checkIn: string, verb: string) {
  if (checkIn < todayIst()) {
    throw new VillaDbError(
      'INVALID_INPUT',
      `${verb} starts in the past: ${checkIn}`,
      `Past nights cannot be ${verb}. Start from today or later.`,
    );
  }
}

/**
 * Blocked dates on the villa's booking site. Callers authorise first. The
 * site stays the one source of availability: a block written here stops the
 * website and channel managers selling those nights at once.
 */
export function createBlocksService(client: SupabaseClient<Database>) {
  /**
   * Nights past the booking cutoff are already unsellable everywhere (the
   * site's check_availability() returns DATE_BLOCKED for them), so a block
   * there would change nothing and an unblock there would appear to do
   * nothing. Refused with the reason rather than written and ignored.
   */
  async function assertWithinCutoff(
    accountId: string,
    checkIn: string,
    verb: string,
  ) {
    const { data } = await client
      .from('villa_account_settings')
      .select('booking_cutoff_date')
      .eq('account_id', accountId)
      .maybeSingle();

    const cutoff = data?.booking_cutoff_date;

    if (cutoff && checkIn > cutoff) {
      throw new VillaDbError(
        'INVALID_INPUT',
        `${verb} beyond cutoff ${cutoff}: ${checkIn}`,
        `Those nights are already closed for booking (cutoff ${cutoff}), so there is nothing to ${verb === 'blocked' ? 'block' : 'unblock'}.`,
      );
    }
  }

  return {
    async create(input: z.output<typeof CreateBlockSchema>, actor: string) {
      assertNotPast(input.checkIn, 'blocked');
      await assertWithinCutoff(input.accountId, input.checkIn, 'blocked');

      const site = await getVillaSite(input.accountId, input.propertyId);

      // createBlock checks availability first, so a block can never be laid
      // over a guest's stay.
      return createBlock(
        site,
        {
          from: input.checkIn,
          to: input.checkOut,
          reason: input.reason,
          notes: input.notes || null,
        },
        actor,
      );
    },

    async release(input: z.output<typeof ReleaseBlockSchema>, actor: string) {
      assertNotPast(input.firstNight, 'unblocked');
      await assertWithinCutoff(input.accountId, input.firstNight, 'unblocked');

      const site = await getVillaSite(input.accountId, input.propertyId);

      return releaseFromBlock(
        site,
        input.blockId,
        { from: input.firstNight, to: endAfterLastNight(input.lastNight) },
        actor,
      );
    },
  };
}
