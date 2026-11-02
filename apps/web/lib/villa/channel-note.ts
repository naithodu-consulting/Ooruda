/**
 * Reads back the note `channelBlockNote` (ical-sync) wrote onto a channel
 * block, so the calendar and the booking list can show what the feed gave us.
 *
 * Client-safe on purpose: these screens are client components.
 *
 * The note is written by us, but it is read from the booking site's database,
 * where an operator can edit it by hand. So nothing here trusts its shape:
 * an unrecognised note yields an empty result and the caller falls back to
 * the plain channel label.
 */
export interface ChannelNote {
  /** True when the host closed the nights on the channel, with no guest. */
  isChannelBlock: boolean;
  /** Airbnb confirmation code, when the feed carried one. */
  confirmationCode: string | null;
  /** Last four digits of the guest's phone, when the feed carried them. */
  phoneLast4: string | null;
}

const EMPTY: ChannelNote = {
  isChannelBlock: false,
  confirmationCode: null,
  phoneLast4: null,
};

export function parseChannelNote(notes: string | null): ChannelNote {
  if (!notes) return EMPTY;

  const parts = notes.split('·').map((p) => p.trim());

  return {
    isChannelBlock: parts.some((p) => /^blocked on channel$/i.test(p)),
    confirmationCode:
      parts.find((p) => /^[A-Z0-9]{6,20}$/.test(p))?.toUpperCase() ?? null,
    phoneLast4: /phone ending (\d{4})/i.exec(notes)?.[1] ?? null,
  };
}
