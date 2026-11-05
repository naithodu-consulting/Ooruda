import { describe, expect, it } from 'vitest';

import {
  type VoidOutcome,
  buildVoidNote,
  checkVoidable,
  commissionNoteFor,
  commissionNoteFragment,
  commissionNoteMatches,
} from './enrichment-void';

describe('checkVoidable', () => {
  it('allows a confirmed channel stay', () => {
    expect(
      checkVoidable({ status: 'confirmed', sourceFeedId: 'feed-1' }),
    ).toBeNull();
  });

  // The whole point: a wrong enrichment is usually found late, and cancelling
  // is gated on today <= check_in, so late is exactly when there is no remedy.
  it('allows a completed stay, with no date restriction', () => {
    expect(
      checkVoidable({ status: 'completed', sourceFeedId: 'feed-1' }),
    ).toBeNull();
  });

  it('refuses a direct booking', () => {
    const refusal = checkVoidable({ status: 'confirmed', sourceFeedId: null });

    expect(refusal?.code).toBe('NOT_CHANNEL_SOLD');
    expect(refusal?.message).toContain('Cancel it instead');
  });

  it('refuses a stay that is already cancelled', () => {
    expect(
      checkVoidable({ status: 'cancelled', sourceFeedId: 'feed-1' })?.code,
    ).toBe('ALREADY_RETIRED');
  });
});

describe('commissionNoteMatches', () => {
  const note =
    'Commission/charges deducted by Airbnb for booking HAB/26-27/000123';

  it('matches the note enrichment writes', () => {
    expect(commissionNoteMatches(note, 'HAB/26-27/000123')).toBe(true);
  });

  it('does not match another booking', () => {
    expect(commissionNoteMatches(note, 'HAB/26-27/000124')).toBe(false);
  });

  it('is false for a missing note or an empty reference', () => {
    expect(commissionNoteMatches(null, 'HAB/26-27/000123')).toBe(false);
    expect(commissionNoteMatches(note, '')).toBe(false);
    expect(commissionNoteMatches(note, '   ')).toBe(false);
  });
});

describe('buildVoidNote', () => {
  const base: VoidOutcome = { receipt: 'voided', commission: 'none' };

  it('states the reason, the cancel, then what was undone', () => {
    expect(buildVoidNote('Enriched the wrong iCal event', base)).toBe(
      'Enriched the wrong iCal event — Stay cancelled on the booking site; Payout receipt voided',
    );
  });

  it('names the commission amount it removed', () => {
    expect(
      buildVoidNote('Duplicate', {
        receipt: 'voided',
        commission: 'removed',
        commissionAmount: 1736,
      }),
    ).toContain('Commission expense removed (₹1,736)');
  });

  it('distinguishes no receipt from a receipt it could not void', () => {
    expect(buildVoidNote('Test entry', { ...base, receipt: 'none' })).toContain(
      'No payout receipt to void',
    );

    // The one outcome that leaves the villa's numbers wrong: it has to say so.
    const failed = buildVoidNote('Test entry', { ...base, receipt: 'failed' });

    expect(failed).toContain('could NOT be voided');
    expect(failed).toContain('by hand');
  });

  it('flags an ambiguous commission for a person to remove', () => {
    const note = buildVoidNote('Wrong guest', {
      receipt: 'voided',
      commission: 'ambiguous',
    });

    expect(note).toContain('NOT removed');
    expect(note).toContain('by hand');
  });

  it('distinguishes a failed commission lookup from there being none', () => {
    expect(
      buildVoidNote('Wrong guest', {
        receipt: 'voided',
        commission: 'unknown',
      }),
    ).toContain('NOT checked');

    expect(buildVoidNote('Wrong guest', base)).not.toContain('Commission');
  });

  it('always records that the stay was cancelled', () => {
    for (const receipt of ['voided', 'none', 'failed'] as const) {
      expect(buildVoidNote('r', { ...base, receipt })).toContain(
        'Stay cancelled on the booking site',
      );
    }
  });
});

describe('commissionNoteFor', () => {
  // The writer and the matcher must agree, or no future void finds the row.
  it('produces a note the matcher recognises', () => {
    const note = commissionNoteFor('Airbnb', 'V19-7KQ-M4X');

    expect(commissionNoteMatches(note, 'V19-7KQ-M4X')).toBe(true);
    expect(commissionNoteMatches(note, 'V19-7KQ-M4Y')).toBe(false);
    expect(note).toContain(commissionNoteFragment('V19-7KQ-M4X'));
  });
});
