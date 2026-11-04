import { describe, expect, it } from 'vitest';

import {
  type BookingGuestDetails,
  type GuestCounts,
  buildEditNote,
  checkGuestChange,
  describeBookingChanges,
  splitGuestName,
} from './booking-edit';
import { MAX_ACTIVITY_NOTE } from './constants';
import { billableGuests, extraGuestCount } from './pricing';

// Villa 19's shape: 8 included in the rate, sleeps 14.
const rules = { baseOccupancy: 8, maxOccupancy: 14 };

const counts = (adults: number, children = 0, infants = 0): GuestCounts => ({
  adults,
  children,
  infants,
});

/** A stay whose extras match the rate card for `before`: the normal case. */
const priced = (extraGuestPaise: number) => extraGuestPaise;

describe('the guest rules are pricing.ts own', () => {
  it('counts adults and children, never infants', () => {
    expect(billableGuests(counts(6, 2, 3))).toBe(8);
    expect(extraGuestCount(counts(6, 2, 3), 8)).toBe(0);
  });

  it('charges only above the included occupancy', () => {
    expect(extraGuestCount(counts(8), 8)).toBe(0);
    expect(extraGuestCount(counts(10), 8)).toBe(2);
    expect(extraGuestCount(counts(4), 8)).toBe(0);
  });
});

describe('checkGuestChange', () => {
  it('allows a change that leaves the extra-guest charge alone', () => {
    // Six adults and two children becomes five and three: still 8 billable.
    expect(
      checkGuestChange({
        before: counts(6, 2),
        after: counts(5, 3),
        rules,
        isChannelSold: false,
        recordedExtraGuestPaise: priced(0),
      }),
    ).toBeNull();
  });

  it('allows infants to change freely', () => {
    expect(
      checkGuestChange({
        before: counts(8, 0, 0),
        after: counts(8, 0, 3),
        rules,
        isChannelSold: false,
        recordedExtraGuestPaise: priced(0),
      }),
    ).toBeNull();
  });

  it('refuses more guests than the villa sleeps', () => {
    const refusal = checkGuestChange({
      before: counts(8),
      after: counts(15),
      rules,
      isChannelSold: false,
      recordedExtraGuestPaise: priced(0),
    });

    expect(refusal?.code).toBe('MAX_OCCUPANCY');
    // The booking form's own wording, so both refusals read the same.
    expect(refusal?.message).toContain('at most 14 guests');
    expect(refusal?.message).toContain('15');
  });

  it('applies the occupancy ceiling to channel stays too', () => {
    // Airbnb owns the money, not the fire regulations.
    expect(
      checkGuestChange({
        before: counts(8),
        after: counts(15),
        rules,
        isChannelSold: true,
        recordedExtraGuestPaise: priced(0),
      })?.code,
    ).toBe('MAX_OCCUPANCY');
  });

  it('refuses a direct booking whose price would change', () => {
    // The doc's own case: booked for 8, ten turn up. Phase 2 territory.
    const refusal = checkGuestChange({
      before: counts(8),
      after: counts(10),
      rules,
      isChannelSold: false,
      recordedExtraGuestPaise: priced(0),
    });

    expect(refusal?.code).toBe('PRICE_WOULD_CHANGE');
    expect(refusal?.message).toContain('more guests');
  });

  it('refuses a reduction that would drop the extra-guest charge', () => {
    const refusal = checkGuestChange({
      before: counts(12),
      after: counts(9),
      rules,
      isChannelSold: false,
      // Four extras were charged, as the rate card says for 12.
      recordedExtraGuestPaise: priced(600_000),
    });

    expect(refusal?.code).toBe('PRICE_WOULD_CHANGE');
    expect(refusal?.message).toContain('fewer guests');
  });

  it('lets a channel stay change counts, since the channel charged', () => {
    expect(
      checkGuestChange({
        before: counts(8),
        after: counts(10),
        rules,
        isChannelSold: true,
        recordedExtraGuestPaise: priced(0),
      }),
    ).toBeNull();
  });

  it('allows a change below the included occupancy either way', () => {
    expect(
      checkGuestChange({
        before: counts(4),
        after: counts(7),
        rules,
        isChannelSold: false,
        recordedExtraGuestPaise: priced(0),
      }),
    ).toBeNull();
  });

  // A preferential price records NO extras whatever the headcount, so the
  // total provably does not follow the guest count and correcting it changes
  // nothing about what is owed. Reasoning from the rate card alone refused
  // this with a message that was simply untrue.
  it('allows a flat-priced stay to correct its count', () => {
    expect(
      checkGuestChange({
        before: counts(10),
        after: counts(9),
        rules,
        isChannelSold: false,
        recordedExtraGuestPaise: 0,
      }),
    ).toBeNull();

    expect(
      checkGuestChange({
        before: counts(10),
        after: counts(14),
        rules,
        isChannelSold: false,
        recordedExtraGuestPaise: 0,
      }),
    ).toBeNull();
  });

  // base_occupancy raised from 4 to 6 after a 5-guest stay was sold with one
  // extra charged. The formula now says 0 extras both before and after an
  // edit to 6 guests, so a naive check waves through exactly the mismatch
  // this guard exists to catch.
  it('refuses when the recorded price disagrees with the rate card', () => {
    const refusal = checkGuestChange({
      before: counts(5),
      after: counts(6),
      rules: { baseOccupancy: 6, maxOccupancy: 14 },
      isChannelSold: false,
      recordedExtraGuestPaise: 150_000,
    });

    expect(refusal?.code).toBe('PRICE_BASIS_UNKNOWN');
    expect(refusal?.message).toContain('outside the current rate card');
  });

  it('still allows a no-op crossing when the basis is unknown', () => {
    // Nothing crosses, so the basis never comes into it.
    expect(
      checkGuestChange({
        before: counts(5),
        after: counts(5, 0, 2),
        rules: { baseOccupancy: 6, maxOccupancy: 14 },
        isChannelSold: false,
        recordedExtraGuestPaise: 150_000,
      }),
    ).toBeNull();
  });
});

describe('splitGuestName', () => {
  it('prefers the stored parts whenever either is set', () => {
    expect(
      splitGuestName('Ignored Entirely', {
        firstName: 'Arun',
        lastName: 'Nair',
      }),
    ).toEqual({ firstName: 'Arun', lastName: 'Nair' });

    expect(
      splitGuestName('Ignored', { firstName: 'Arun', lastName: null }),
    ).toEqual({ firstName: 'Arun', lastName: '' });
  });

  // The regression: a row with only guest_name seeded an empty form, and
  // typing one word rewrote the stored name.
  it('splits the joined name when both parts are null, losslessly', () => {
    const split = splitGuestName('Ramesh Kumar Nair', {
      firstName: null,
      lastName: null,
    });

    expect(split).toEqual({ firstName: 'Ramesh', lastName: 'Kumar Nair' });
    expect(`${split.firstName} ${split.lastName}`).toBe('Ramesh Kumar Nair');
  });

  it('handles a single word, extra spaces and nothing at all', () => {
    expect(
      splitGuestName('Ramesh', { firstName: null, lastName: null }),
    ).toEqual({ firstName: 'Ramesh', lastName: '' });

    expect(
      splitGuestName('  Ramesh   Kumar  ', { firstName: null, lastName: null }),
    ).toEqual({ firstName: 'Ramesh', lastName: 'Kumar' });

    expect(splitGuestName('', { firstName: null, lastName: null })).toEqual({
      firstName: '',
      lastName: '',
    });

    expect(splitGuestName('   ', { firstName: '  ', lastName: null })).toEqual({
      firstName: '',
      lastName: '',
    });
  });
});

describe('describeBookingChanges', () => {
  const before: BookingGuestDetails = {
    salutation: 'Mr',
    guestName: 'Arun Nair',
    firstName: 'Arun',
    lastName: 'Nair',
    phone: '9876543210',
    email: 'arun@example.com',
    adults: 6,
    children: 2,
    infants: 0,
    specialRequests: 'Late check-in',
  };

  it('is empty when nothing moved', () => {
    expect(describeBookingChanges(before, { ...before })).toEqual([]);
  });

  it('names each changed field with both values', () => {
    expect(
      describeBookingChanges(before, {
        ...before,
        firstName: 'Arjun',
        phone: '9000000000',
      }),
    ).toEqual(['First name: Arun → Arjun', 'Phone: 9876543210 → 9000000000']);
  });

  // guest_name is what the invoice, the registration card and the police
  // verification read, so a change to it is logged in its own right.
  it('records the joined name changing', () => {
    expect(
      describeBookingChanges(before, {
        ...before,
        guestName: 'Arjun Nair',
        firstName: 'Arjun',
      }),
    ).toEqual(['Name: Arun Nair → Arjun Nair', 'First name: Arun → Arjun']);
  });

  it('marks an emptied field rather than printing nothing', () => {
    expect(describeBookingChanges(before, { ...before, lastName: '' })).toEqual(
      ['Last name: Nair → (empty)'],
    );
  });

  it('summarises special requests instead of quoting them', () => {
    expect(
      describeBookingChanges(before, { ...before, specialRequests: 'BBQ' }),
    ).toEqual(['Special requests: changed']);
    expect(
      describeBookingChanges(before, { ...before, specialRequests: '' }),
    ).toEqual(['Special requests: cleared']);
    expect(
      describeBookingChanges(
        { ...before, specialRequests: '' },
        { ...before, specialRequests: 'BBQ' },
      ),
    ).toEqual(['Special requests: added']);
  });

  it('reports a guest count change as numbers', () => {
    expect(describeBookingChanges(before, { ...before, infants: 2 })).toEqual([
      'Infants: 0 → 2',
    ]);
  });
});

describe('buildEditNote', () => {
  it('leads with the reason, then the diff', () => {
    expect(buildEditNote('Typo on the invoice', ['First name: A → B'])).toBe(
      'Typo on the invoice — First name: A → B',
    );
  });

  it('is just the reason when nothing changed', () => {
    expect(buildEditNote('  Checked with the guest  ', [])).toBe(
      'Checked with the guest',
    );
  });

  it('truncates to the column, keeping the reason', () => {
    const note = buildEditNote(
      'Reason',
      Array.from({ length: 80 }, (_, i) => `Field ${i}: aaaa → bbbb`),
    );

    expect(note.length).toBeLessThanOrEqual(MAX_ACTIVITY_NOTE);
    expect(note.startsWith('Reason — ')).toBe(true);
    expect(note.endsWith('…')).toBe(true);
  });
});
