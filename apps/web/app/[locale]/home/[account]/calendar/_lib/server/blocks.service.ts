import 'server-only';
import type * as z from 'zod';

import { createBlock, releaseFromBlock } from '~/lib/villa-db/blocks';
import { getVillaSite } from '~/lib/villa-db/client';
import { endAfterLastNight, todayIst } from '~/lib/villa-db/dates';
import { VillaDbError } from '~/lib/villa-db/errors';

import type {
  CreateBlockSchema,
  ReleaseBlockSchema,
} from '../schemas/blocks.schema';

function assertNotPast(firstNight: string, verb: string) {
  if (firstNight < todayIst()) {
    throw new VillaDbError(
      'INVALID_INPUT',
      `${verb} starts in the past: ${firstNight}`,
      `Past nights cannot be ${verb}. Start from today or later.`,
    );
  }
}

/**
 * Blocked dates on the villa's booking site. Callers authorise first. The
 * site stays the one source of availability: a block written here stops the
 * website and channel managers selling those nights at once.
 */
export function createBlocksService() {
  return {
    async create(input: z.output<typeof CreateBlockSchema>, actor: string) {
      assertNotPast(input.firstNight, 'blocked');

      const site = await getVillaSite(input.accountId, input.propertyId);

      // createBlock checks availability first, so a block can never be laid
      // over a guest's stay.
      return createBlock(
        site,
        {
          from: input.firstNight,
          to: endAfterLastNight(input.lastNight),
          reason: input.reason,
          notes: input.notes || null,
        },
        actor,
      );
    },

    async release(input: z.output<typeof ReleaseBlockSchema>, actor: string) {
      assertNotPast(input.firstNight, 'unblocked');

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
