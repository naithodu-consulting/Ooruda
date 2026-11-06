/**
 * Errors from the villa-booking database, mapped to what an operator can act
 * on. Callers switch on `code`; `message` is safe to show.
 */

export type VillaDbErrorCode =
  | 'NOT_CONFIGURED' // property not linked to a booking site yet
  | 'UNREACHABLE' // the booking site's database did not answer (a read)
  | 'UNCERTAIN' // a WRITE timed out: it may or may not have been saved
  | 'INACTIVE' // the property is switched off in Ooruda
  | 'DATE_UNAVAILABLE' // a booking (or a guest mid-checkout) holds those nights
  | 'DATE_BLOCKED' // an existing block covers those nights
  | 'CHANNEL_MANAGED' // the block belongs to a channel feed, not to Ooruda
  | 'CHANNEL_EVENT_GONE' // the channel's calendar no longer holds those nights
  | 'HOLD_LAPSED' // the 15-minute hold expired before we confirmed
  | 'INVALID_INPUT' // bad dates, zero-night range, negative amounts…
  | 'OVERLAP' // a pricing rule already covers some of those nights
  | 'NOT_FOUND'
  | 'CONFLICT' // the row changed underneath us (e.g. already cancelled)
  | 'UNKNOWN';

const MESSAGES: Record<VillaDbErrorCode, string> = {
  NOT_CONFIGURED:
    'This villa is not connected to its booking site yet. Ask Ooruda support to connect it.',
  UNREACHABLE: 'The booking site could not be reached. Please try again.',
  UNCERTAIN:
    'The booking site did not answer in time. The change may have been saved: refresh before trying again.',
  INACTIVE: 'This villa property is switched off in Ooruda.',
  DATE_UNAVAILABLE:
    'Some of those nights are already booked, or a guest is checking out right now. Refresh the calendar and pick other dates.',
  DATE_BLOCKED: 'Some of those nights are already blocked.',
  CHANNEL_MANAGED:
    'These nights come from a booking channel’s calendar, so they cannot be unblocked here. Remove the booking on the channel instead — the next sync clears it.',
  CHANNEL_EVENT_GONE:
    'The booking channel’s calendar no longer shows this stay on these nights — it was changed or cancelled there. Refresh the page to see what the channel says now.',
  HOLD_LAPSED:
    'The dates were released before the booking was confirmed. Please try again.',
  INVALID_INPUT: 'Some details are not valid. Check the dates and amounts.',
  OVERLAP: 'Another seasonal rate already covers some of those nights.',
  NOT_FOUND: 'That booking or record no longer exists.',
  CONFLICT: 'This record was changed by someone else. Refresh and try again.',
  UNKNOWN: 'Something went wrong with the booking site. Please try again.',
};

export class VillaDbError extends Error {
  readonly code: VillaDbErrorCode;
  /** Technical detail for logs — never shown to users. */
  readonly detail?: string;

  constructor(code: VillaDbErrorCode, detail?: string, message?: string) {
    super(message ?? MESSAGES[code]);
    this.name = 'VillaDbError';
    this.code = code;
    this.detail = detail;
  }
}

/** Expected refusals (dates taken, overlaps, bad input…), not failures. */
export const REJECTION_CODES: readonly VillaDbErrorCode[] = [
  'DATE_UNAVAILABLE',
  'DATE_BLOCKED',
  'CHANNEL_MANAGED',
  'CHANNEL_EVENT_GONE',
  'OVERLAP',
  'INVALID_INPUT',
  'HOLD_LAPSED',
  'CONFLICT',
  'INACTIVE',
];

export function isVillaDbError(error: unknown): error is VillaDbError {
  return error instanceof VillaDbError;
}

/**
 * Maps a PostgREST / Postgres error from the villa-booking database.
 * `create_booking_atomic` raises messages prefixed with DATE_UNAVAILABLE /
 * DATE_BLOCKED (its integration contract, §5.1).
 */
export function fromSiteError(error: {
  message?: string;
  code?: string;
  details?: string | null;
}): VillaDbError {
  const message = error.message ?? '';
  const detail = [error.code, message, error.details]
    .filter(Boolean)
    .join(' | ');

  if (message.startsWith('DATE_UNAVAILABLE')) {
    return new VillaDbError('DATE_UNAVAILABLE', detail);
  }

  if (message.startsWith('DATE_BLOCKED')) {
    return new VillaDbError('DATE_BLOCKED', detail);
  }

  // check_occupancy, when the channel event a booking names is no longer in
  // the calendar or no longer covers the whole stay (villa-booking 00108).
  if (message.startsWith('CHANNEL_EVENT_GONE')) {
    return new VillaDbError('CHANNEL_EVENT_GONE', detail);
  }

  // move_booking_dates (villa-booking 00112). Each refusal is also checked in
  // the service, which gives the operator the better sentence; these are the
  // backstop for anything that changed between that check and the write.
  if (
    message.startsWith('STALE_WRITE') ||
    message.startsWith('NOT_CONFIRMED') ||
    message.startsWith('ALREADY_INVOICED') ||
    message.startsWith('CHANNEL_SOLD')
  ) {
    return new VillaDbError('CONFLICT', detail);
  }

  if (message.startsWith('INVALID_RANGE')) {
    return new VillaDbError('INVALID_INPUT', detail);
  }

  if (message.startsWith('BOOKING_NOT_FOUND')) {
    return new VillaDbError('NOT_FOUND', detail);
  }

  // create_booking_atomic, when a link names a feed of another property.
  if (message.startsWith('FEED_MISMATCH')) {
    return new VillaDbError('INVALID_INPUT', detail);
  }

  // check_violation / invalid_text_representation / not_null_violation
  if (
    error.code === '23514' ||
    error.code === '22P02' ||
    error.code === '23502'
  ) {
    return new VillaDbError('INVALID_INPUT', detail);
  }

  if (error.code === '23505' || error.code === '23P01') {
    return new VillaDbError('CONFLICT', detail);
  }

  if (/fetch failed|ECONNREFUSED|ENOTFOUND|timeout|aborted/i.test(message)) {
    return new VillaDbError('UNREACHABLE', detail);
  }

  return new VillaDbError('UNKNOWN', detail);
}

/**
 * For WRITE paths: a request that never answered may still have committed on
 * the site, so "unreachable" becomes "uncertain" — never "nothing changed".
 */
export function fromSiteWriteError(error: {
  message?: string;
  code?: string;
  details?: string | null;
}): VillaDbError {
  const mapped = fromSiteError(error);

  return mapped.code === 'UNREACHABLE'
    ? new VillaDbError('UNCERTAIN', mapped.detail)
    : mapped;
}

/**
 * Rupees → paise for a named field, as an INVALID_INPUT error (never echoing
 * the raw value back to the browser).
 */
export function invalidAmount(field: string): VillaDbError {
  return new VillaDbError(
    'INVALID_INPUT',
    `invalid amount for ${field}`,
    `Enter a valid amount for ${field} (up to 2 decimals).`,
  );
}
