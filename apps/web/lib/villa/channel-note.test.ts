import { describe, expect, it } from 'vitest';

import { parseChannelNote } from './channel-note';
import { channelBlockNote } from './ical-sync';

describe('parseChannelNote', () => {
  it('reads back what channelBlockNote wrote', () => {
    const note = channelBlockNote('Airbnb', {
      kind: 'reservation',
      confirmationCode: 'HM5XK3J9QW',
      phoneLast4: '4821',
    });

    expect(parseChannelNote(note)).toEqual({
      isChannelBlock: false,
      confirmationCode: 'HM5XK3J9QW',
      phoneLast4: '4821',
    });
  });

  it('marks a host-closed block', () => {
    const note = channelBlockNote('Airbnb', {
      kind: 'block',
      confirmationCode: null,
      phoneLast4: null,
    });

    expect(parseChannelNote(note)).toEqual({
      isChannelBlock: true,
      confirmationCode: null,
      phoneLast4: null,
    });
  });

  // The regression: the channel name is segment 0, and a feed named in capitals
  // matched the bare-code pattern. Channel enrichment writes this value into the
  // payout receipt's reference, so it had to stop being a guess.
  it.each(['AIRBNB', 'MAKEMYTRIP', 'GOIBIBO'])(
    'does not read the feed name %s as a confirmation code',
    (feedName) => {
      const note = channelBlockNote(feedName, {
        kind: 'block',
        confirmationCode: null,
        phoneLast4: null,
      });

      expect(parseChannelNote(note).confirmationCode).toBeNull();
    },
  );

  it('still finds a real code alongside an all-caps feed name', () => {
    const note = channelBlockNote('AIRBNB', {
      kind: 'reservation',
      confirmationCode: 'HM5XK3J9QW',
      phoneLast4: null,
    });

    expect(parseChannelNote(note).confirmationCode).toBe('HM5XK3J9QW');
  });

  it('reads notes written before the code was labelled', () => {
    expect(
      parseChannelNote('Airbnb · booking · HM5XK3J9QW · phone ending 4821'),
    ).toEqual({
      isChannelBlock: false,
      confirmationCode: 'HM5XK3J9QW',
      phoneLast4: '4821',
    });

    // Legacy, all-caps feed name, no code: segment 0 is skipped.
    expect(
      parseChannelNote('AIRBNB · blocked on channel').confirmationCode,
    ).toBeNull();
  });

  it('is empty for a note it does not recognise', () => {
    expect(parseChannelNote(null)).toEqual({
      isChannelBlock: false,
      confirmationCode: null,
      phoneLast4: null,
    });

    // A manual Ooruda block, not a channel note at all.
    expect(parseChannelNote('MAINTENANCE')).toEqual({
      isChannelBlock: false,
      confirmationCode: null,
      phoneLast4: null,
    });
  });
});
