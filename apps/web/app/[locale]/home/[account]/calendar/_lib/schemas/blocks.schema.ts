import * as z from 'zod';

import { OPERATOR_BLOCK_REASONS } from '~/lib/villa/constants';

const ids = {
  accountId: z.string().uuid(),
  propertyId: z.string().uuid(),
};

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Pick a date' });

// People pick the first and last NIGHT; the server converts to the site's
// [start, morning after) range.
const nights = {
  firstNight: ymd,
  lastNight: ymd,
};

const lastOnOrAfterFirst = (v: { firstNight: string; lastNight: string }) =>
  v.lastNight >= v.firstNight;

const lastNightMessage = {
  message: 'The last night cannot be before the first night',
  path: ['lastNight'],
};

export const CreateBlockSchema = z
  .object({
    ...ids,
    ...nights,
    reason: z.enum(OPERATOR_BLOCK_REASONS),
    notes: z.string().trim().max(500),
  })
  .refine(lastOnOrAfterFirst, lastNightMessage);

export type CreateBlockInput = z.input<typeof CreateBlockSchema>;

export const ReleaseBlockSchema = z
  .object({
    ...ids,
    ...nights,
    blockId: z.string().uuid(),
  })
  .refine(lastOnOrAfterFirst, lastNightMessage);

export type ReleaseBlockInput = z.input<typeof ReleaseBlockSchema>;
