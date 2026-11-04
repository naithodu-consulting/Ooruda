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

/**
 * The code is written labelled (`code HM5XK3J9QW`) so it can be recognised for
 * what it is. Notes written before that label existed carry the code as a bare
 * segment, so those are still read — but never from segment 0, which is the
 * channel's own name. An unlabelled scan that included it read a feed named in
 * capitals (`AIRBNB`, `MAKEMYTRIP`) back as a confirmation code, and channel
 * enrichment puts that value in the payout receipt's reference.
 */
const LABELLED_CODE = /^code\s+([A-Z0-9]{6,20})$/i;
const BARE_CODE = /^[A-Z0-9]{6,20}$/;

function findConfirmationCode(parts: string[]): string | null {
  for (const part of parts) {
    const labelled = LABELLED_CODE.exec(part);
    if (labelled) return labelled[1]!.toUpperCase();
  }

  // Legacy notes: segment 0 is the channel name, so start past it.
  for (const part of parts.slice(1)) {
    if (BARE_CODE.test(part)) return part.toUpperCase();
  }

  return null;
}

export function parseChannelNote(notes: string | null): ChannelNote {
  if (!notes) return EMPTY;

  const parts = notes.split('·').map((p) => p.trim());

  return {
    isChannelBlock: parts.some((p) => /^blocked on channel$/i.test(p)),
    confirmationCode: findConfirmationCode(parts),
    phoneLast4: /phone ending (\d{4})/i.exec(notes)?.[1] ?? null,
  };
}
