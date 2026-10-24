import { describe, expect, it } from 'vitest';

import {
  isPreArrivalDue,
  isThankYouDue,
  istInstant,
  renderGuestEmail,
} from './guest-emails';

const at = (ymd: string, hhmm: string) => istInstant(ymd, hhmm);

describe('pre-arrival timing', () => {
  it('opens at 10:00 IST the day before check-in', () => {
    expect(
      isPreArrivalDue('2026-10-10', '14:00', at('2026-10-09', '09:59')),
    ).toBe(false);
    expect(
      isPreArrivalDue('2026-10-10', '14:00', at('2026-10-09', '10:00')),
    ).toBe(true);
  });

  it('still goes the morning of arrival, up to 3 hours before check-in', () => {
    expect(
      isPreArrivalDue('2026-10-10', '14:00', at('2026-10-10', '10:59')),
    ).toBe(true);
    expect(
      isPreArrivalDue('2026-10-10', '14:00', at('2026-10-10', '11:00')),
    ).toBe(false);
  });

  it('follows the villa check-in time (and its HH:MM:SS form)', () => {
    expect(
      isPreArrivalDue('2026-10-10', '12:00:00', at('2026-10-10', '09:30')),
    ).toBe(false);
    expect(isPreArrivalDue('2026-10-10', null, at('2026-10-10', '10:30'))).toBe(
      true,
    );
  });

  it('is not due two days early or after arrival', () => {
    expect(
      isPreArrivalDue('2026-10-10', '14:00', at('2026-10-08', '12:00')),
    ).toBe(false);
    expect(
      isPreArrivalDue('2026-10-10', '14:00', at('2026-10-11', '10:00')),
    ).toBe(false);
  });
});

describe('check-in time formats', () => {
  it('reads one-digit hours', () => {
    // 9:00 check-in: window closes at 06:00, so 07:00 is too late.
    expect(
      isPreArrivalDue('2026-10-10', '9:00', at('2026-10-10', '07:00')),
    ).toBe(false);
    expect(
      isPreArrivalDue('2026-10-10', '9:00', at('2026-10-10', '05:30')),
    ).toBe(true);
  });
});

describe('thank-you timing', () => {
  const out = at('2026-10-12', '11:00');

  it('waits 3 hours after check-out is pressed', () => {
    expect(isThankYouDue(out, at('2026-10-12', '13:59'))).toBe(false);
    expect(isThankYouDue(out, at('2026-10-12', '14:00'))).toBe(true);
  });

  it('gives up after 7 days', () => {
    expect(isThankYouDue(out, at('2026-10-19', '11:01'))).toBe(false);
  });
});

describe('renderGuestEmail', () => {
  const ctx = {
    villaName: 'Villa 19',
    guestName: 'Asha <b>Rao</b>',
    bookingCode: 'V19-7KQ-M4X',
    checkIn: '2026-10-10',
    checkOut: '2026-10-12',
    checkInTime: '14:00:00',
    checkOutTime: '11:00',
    adults: 4,
    whatsApp: '+919845000000',
    contacts: [{ name: 'Ravi', role: 'Caretaker', phone: '+919000000001' }],
  };

  it('pre-arrival carries dates, times, ID reminder and contacts; escapes input', () => {
    const { subject, html } = renderGuestEmail('pre_arrival', ctx);
    expect(subject).toBe('Your stay at Villa 19 on 10 Oct (V19-7KQ-M4X)');
    expect(html).toContain('Saturday, 10 October 2026');
    expect(html).toContain('from 2 pm');
    expect(html).toContain('by 11 am');
    expect(html).toContain('photo ID');
    expect(html).toContain('Caretaker: Ravi');
    expect(html).toContain('https://wa.me/919845000000');
    expect(html).not.toContain('<b>Rao</b>');
    expect(html).toContain('See you soon, Asha');
  });

  it('thank-you does not list staff contacts', () => {
    const { subject, html } = renderGuestEmail('thank_you', ctx);
    expect(subject).toBe('Thank you for staying at Villa 19 (V19-7KQ-M4X)');
    expect(html).not.toContain('Caretaker');
  });
});

describe('booking confirmation payment block', () => {
  const money = {
    villaName: 'Villa 19',
    guestName: 'Asha Rao',
    bookingCode: 'V19-7KQ-M4X',
    checkIn: '2026-10-10',
    checkOut: '2026-10-12',
    checkInTime: '14:00',
    checkOutTime: '11:00',
    adults: 2,
    baseAmountPaise: 4_600_000,
    taxAmountPaise: 828_000,
    totalAmountPaise: 5_428_000,
    whatsApp: null,
    contacts: [],
  };

  it('states the real deposit and the real balance', () => {
    const { html } = renderGuestEmail('booking_confirmation', {
      ...money,
      paymentStatus: 'partially_paid',
      amountPaidPaise: 2_000_000,
    });

    expect(html).toContain('Deposit received');
    expect(html).toContain('20,000');
    expect(html).toContain('Balance due');
    expect(html).toContain('34,280');
  });

  it('a fully paid stay is never told a balance is due', () => {
    const { html } = renderGuestEmail('booking_confirmation', {
      ...money,
      paymentStatus: 'paid',
      amountPaidPaise: 5_428_000,
    });

    expect(html).toContain('paid in full');
    expect(html).not.toContain('Balance due');
    expect(html).not.toContain('balance is due at check-in');
  });

  it('invents no figure when a deposit was never receipted', () => {
    const { html } = renderGuestEmail('booking_confirmation', {
      ...money,
      paymentStatus: 'partially_paid',
      amountPaidPaise: 0,
    });

    expect(html).toContain('Deposit received');
    expect(html).not.toContain('Balance due');
    expect(html).toContain('balance is due at check-in');
  });

  it('unpaid owes the full amount at check-in', () => {
    const { html } = renderGuestEmail('booking_confirmation', {
      ...money,
      paymentStatus: 'unpaid',
      amountPaidPaise: 0,
    });

    expect(html).toContain('Balance due');
    expect(html).toContain('54,280');
    expect(html).toContain('Payment is due at check-in');
  });
});
