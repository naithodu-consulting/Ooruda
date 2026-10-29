import { describe, expect, it } from 'vitest';

import {
  DEFAULT_VILLA_ENTITY,
  formatSenderAddress,
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

describe('booking confirmation: cancellation ladder', () => {
  const booked = {
    villaName: 'Villa 19',
    guestName: 'Asha Rao',
    bookingCode: 'V19-7KQ-M4X',
    checkIn: '2026-12-24',
    checkOut: '2026-12-26',
    checkInTime: '14:00',
    checkOutTime: '11:00',
    adults: 2,
    baseAmountPaise: 4_600_000,
    taxAmountPaise: 828_000,
    totalAmountPaise: 5_428_000,
    paymentStatus: 'paid',
    amountPaidPaise: 5_428_000,
    whatsApp: null,
    contacts: [],
    supportEmail: 'reservations@example.com',
  };

  it('booked well ahead: the full ladder, 100% first', () => {
    const { html } = renderGuestEmail('booking_confirmation', {
      ...booked,
      bookedAt: '2026-10-01T12:00:00+05:30',
    });

    expect(html).toContain('Cancellations &amp; refund');
    // 15 days before 24 Dec is 9 Dec.
    expect(html).toContain('Until Wed 9 Dec, 11:59 pm');
    expect(html).toContain('54,280');
    expect(html).toContain('10 Dec 12:00 am to 17 Dec 11:59 pm');
    expect(html).toContain('27,140');
    expect(html).not.toContain('may be eligible for a refund');
  });

  it('booked inside the top tier: narrowed ladder with the last date called out', () => {
    const { html } = renderGuestEmail('booking_confirmation', {
      ...booked,
      bookedAt: '2026-12-12T12:00:00+05:30',
    });

    expect(html).toContain('may be eligible for a refund');
    expect(html).toContain('Thu 17 Dec, 11:59 pm');
    expect(html).not.toContain('Until Wed 9 Dec');
  });

  it('booked under a week out: plainly non-refundable, with no refund address', () => {
    const { html } = renderGuestEmail('booking_confirmation', {
      ...booked,
      bookedAt: '2026-12-20T12:00:00+05:30',
    });

    expect(html).toContain('This booking is non-refundable.');
    expect(html).not.toContain('will be refunded');
    expect(html).not.toContain('5 to 7 working days');
  });

  it('prints no ladder at all when the booking date is unknown', () => {
    const { html } = renderGuestEmail('booking_confirmation', booked);

    expect(html).not.toContain('Cancellations &amp; refund');
  });
});

describe('booking confirmation: policy links, footer and text part', () => {
  const full = {
    villaName: 'Villa 19',
    guestName: 'Asha Rao',
    guestEmail: 'asha@example.com',
    guestPhone: '+919845012345',
    bookedAt: '2026-10-01T12:00:00+05:30',
    bookingCode: 'V19-7KQ-M4X',
    checkIn: '2026-12-24',
    checkOut: '2026-12-26',
    checkInTime: '14:00',
    checkOutTime: '11:00',
    adults: 6,
    baseAmountPaise: 4_600_000,
    extraGuestAmountPaise: 400_000,
    taxAmountPaise: 900_000,
    totalAmountPaise: 5_900_000,
    paymentStatus: 'paid',
    amountPaidPaise: 5_900_000,
    paymentMethod: 'Razorpay',
    paymentDate: '2026-10-01T12:00:00+05:30',
    extraGuests: 2,
    whatsApp: '+919845000000',
    contacts: [],
    propertyLocation: 'Mangalore, Karnataka',
    bookingUrl: 'https://stay.example.com/booking/tok123',
    siteBaseUrl: 'https://stay.example.com/',
    legalName: 'EXAMPLE STAYS PVT LTD',
    legalAddress: '209, Example Road, Mangalore 575003',
    cin: 'U47711KA2025PTC207750',
    gstin: '29AAICH1682G1ZD',
    supportEmail: 'reservations@example.com',
  };

  it('links all three policies off the site origin, trailing slash and all', () => {
    const { html } = renderGuestEmail('booking_confirmation', full);

    expect(html).toContain('https://stay.example.com/privacy');
    expect(html).toContain('https://stay.example.com/terms');
    expect(html).toContain('https://stay.example.com/cancellation');
    expect(html).not.toContain('https://stay.example.com//');
  });

  it('falls back to default villa site URL when siteBaseUrl is null or unset', () => {
    const { html, text } = renderGuestEmail('booking_confirmation', {
      ...full,
      siteBaseUrl: null,
    });

    expect(html).toContain('https://villa19.in/privacy');
    expect(html).toContain('https://villa19.in/terms');
    expect(html).toContain('https://villa19.in/cancellation');
    expect(text).toContain('https://villa19.in/privacy');
    expect(text).toContain('https://villa19.in/terms');
    expect(text).toContain('https://villa19.in/cancellation');
  });

  it('carries the CTA, the locality, the extra-guest count and the paid line', () => {
    const { html } = renderGuestEmail('booking_confirmation', full);

    expect(html).toContain('View your booking');
    expect(html).toContain('https://stay.example.com/booking/tok123');
    expect(html).toContain('Mangalore, Karnataka');
    expect(html).toContain('Extra guests, 2');
    expect(html).toContain('Paid 1 Oct 2026 · Razorpay');
  });

  it('prints the company footer', () => {
    const { html } = renderGuestEmail('booking_confirmation', full);

    expect(html).toContain('EXAMPLE STAYS PVT LTD');
    expect(html).toContain('CIN: U47711KA2025PTC207750');
    expect(html).toContain('GSTIN: 29AAICH1682G1ZD');
    expect(html).toContain('because you have booked a stay with us');
  });

  it('skips the footer entirely for a villa with no company details', () => {
    const { html } = renderGuestEmail('booking_confirmation', {
      ...full,
      legalName: null,
      legalAddress: null,
      cin: null,
      gstin: null,
    });

    expect(html).not.toContain('because you have booked a stay with us');
  });

  it('ships a plain-text alternative that says the same things', () => {
    const { text } = renderGuestEmail('booking_confirmation', full);

    expect(text).toBeDefined();
    expect(text).toContain('YOUR BOOKING IS CONFIRMED');
    expect(text).toContain('Booking reference: V19-7KQ-M4X');
    expect(text).toContain('CANCELLATIONS & REFUND');
    expect(text).toContain(
      'Cancellation Policy: https://stay.example.com/cancellation',
    );
    expect(text).toContain(
      'View your booking: https://stay.example.com/booking/tok123',
    );
    expect(text).toContain('EXAMPLE STAYS PVT LTD');
    // No markup leaks into the text part.
    expect(text).not.toContain('<');
  });

  it('the other two templates still carry no text part', () => {
    expect(renderGuestEmail('pre_arrival', full).text).toBeUndefined();
  });

  it('renders the WhatsApp row with "The fastest way to reach us" subtitle and link', () => {
    const { html, text } = renderGuestEmail('booking_confirmation', {
      ...full,
      whatsApp: '+918050484123',
    });

    expect(html).toContain('WhatsApp');
    expect(html).toContain('https://wa.me/918050484123');
    expect(html).toContain('+91 80504 84123');
    expect(html).toContain('The fastest way to reach us.');
    expect(text).toContain('WhatsApp: +91 80504 84123');
  });
});

describe('formatSenderAddress', () => {
  it('formats bare email into display name with villa name', () => {
    expect(formatSenderAddress('Villa 19', 'reservations@habbaa.com')).toBe(
      'Villa 19 <reservations@habbaa.com>',
    );
  });

  it('replaces existing display name with villa name', () => {
    expect(
      formatSenderAddress(
        'Villa 19',
        'Villa 19 by Habbaa <reservations@habbaa.com>',
      ),
    ).toBe('Villa 19 <reservations@habbaa.com>');
    expect(
      formatSenderAddress('Villa 19', 'reservations <reservations@habbaa.com>'),
    ).toBe('Villa 19 <reservations@habbaa.com>');
  });

  it('returns raw value if no email can be extracted', () => {
    expect(formatSenderAddress('Villa 19', 'invalid-sender')).toBe(
      'invalid-sender',
    );
  });
});

describe('DEFAULT_VILLA_ENTITY', () => {
  it('has the canonical company details and WhatsApp for Habbaa', () => {
    expect(DEFAULT_VILLA_ENTITY.legalName).toBe('HABBAA SOLUTIONS PVT LTD');
    expect(DEFAULT_VILLA_ENTITY.cin).toBe('U47711KA2025PTC207750');
    expect(DEFAULT_VILLA_ENTITY.supportEmail).toBe('reservations@habbaa.com');
    expect(DEFAULT_VILLA_ENTITY.whatsApp).toBe('+918050484123');
    expect(DEFAULT_VILLA_ENTITY.legalAddress).toContain('209, Citadel Prism');
  });

  it('carries no GSTIN: that is a per-state registration, so it belongs to the property', () => {
    expect(DEFAULT_VILLA_ENTITY).not.toHaveProperty('gstin');
  });
});

describe('booking confirmation: the refund ladder follows the money', () => {
  const base = {
    villaName: 'Villa 19',
    guestName: 'Asha Rao',
    bookingCode: 'V19-7KQ-M4X',
    bookedAt: '2026-10-01T12:00:00+05:30',
    checkIn: '2026-12-24',
    checkOut: '2026-12-26',
    checkInTime: '14:00',
    checkOutTime: '11:00',
    adults: 2,
    baseAmountPaise: 4_600_000,
    taxAmountPaise: 828_000,
    totalAmountPaise: 5_428_000,
    whatsApp: null,
    contacts: [],
    supportEmail: 'reservations@example.com',
    siteBaseUrl: 'https://stay.example.com',
  };

  it('quotes what was received, not the contract total', () => {
    const { html } = renderGuestEmail('booking_confirmation', {
      ...base,
      paymentStatus: 'partially_paid',
      amountPaidPaise: 1_000_000,
    });

    // ₹10,000 received: the top tier returns that, not the ₹54,280 total.
    expect(html).toContain('₹10,000');
    expect(html).toContain('will be refunded');
    expect(html).not.toContain('₹54,280</strong> will be refunded');
  });

  it('promises nothing back on a booking with nothing paid', () => {
    const { html, text } = renderGuestEmail('booking_confirmation', {
      ...base,
      paymentStatus: 'unpaid',
      amountPaidPaise: 0,
    });

    expect(html).not.toContain('will be refunded');
    expect(text).not.toContain('will be refunded');
    // The policy still reaches the guest.
    expect(html).toContain('stay.example.com/cancellation');
  });

  it('quotes no figure when a deposit was never receipted', () => {
    const { html } = renderGuestEmail('booking_confirmation', {
      ...base,
      paymentStatus: 'partially_paid',
      amountPaidPaise: 0,
    });

    expect(html).toContain('Deposit received');
    expect(html).not.toContain('will be refunded');
  });

  it('dates the paid line from the receipt, not from the booking', () => {
    const { html } = renderGuestEmail('booking_confirmation', {
      ...base,
      paymentStatus: 'paid',
      amountPaidPaise: 5_428_000,
      paymentMethod: 'Bank transfer',
      paymentDate: '2026-10-14',
    });

    expect(html).toContain('Paid 14 Oct 2026 · Bank transfer');
    expect(html).not.toContain('Paid 1 Oct 2026');
  });

  it('prints no date at all when the receipt date is unknown', () => {
    const { html } = renderGuestEmail('booking_confirmation', {
      ...base,
      paymentStatus: 'paid',
      amountPaidPaise: 5_428_000,
      paymentMethod: 'Cash',
    });

    expect(html).toContain('Paid · Cash');
    expect(html).not.toContain('Paid 1 Oct 2026');
  });
});
