import * as z from 'zod';

import { OPERATOR_BLOCK_REASONS } from '~/lib/villa/constants';

const ids = {
  accountId: z.string().uuid(),
  propertyId: z.string().uuid(),
};

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Pick a date' });

// Check-in is the first night; check-out is the first free morning (the
// exclusive end: endDate in the site's [start, end) range).
const nights = {
  checkIn: ymd,
  checkOut: ymd,
};

const checkOutAfterCheckIn = (v: { checkIn: string; checkOut: string }) =>
  v.checkOut > v.checkIn;

const checkOutMessage = {
  message: 'Check-out must be after check-in',
  path: ['checkOut'],
};

export const CreateBlockSchema = z
  .object({
    ...ids,
    ...nights,
    reason: z.enum(OPERATOR_BLOCK_REASONS),
    notes: z.string().trim().max(500),
  })
  .refine(checkOutAfterCheckIn, checkOutMessage);

export type CreateBlockInput = z.input<typeof CreateBlockSchema>;

// Release picks a range of nights by first and last night (not checkout morning).
const releaseNights = {
  firstNight: ymd,
  lastNight: ymd,
};

const lastOnOrAfterFirst = (v: { firstNight: string; lastNight: string }) =>
  v.lastNight >= v.firstNight;

const lastNightMessage = {
  message: 'The last night cannot be before the first night',
  path: ['lastNight'],
};

export const ReleaseBlockSchema = z
  .object({
    ...ids,
    ...releaseNights,
    blockId: z.string().uuid(),
  })
  .refine(lastOnOrAfterFirst, lastNightMessage);

export type ReleaseBlockInput = z.input<typeof ReleaseBlockSchema>;
