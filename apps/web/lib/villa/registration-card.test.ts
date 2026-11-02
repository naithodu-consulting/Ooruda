import { describe, expect, it } from 'vitest';

import {
  type RegistrationCardBooking,
  type RegistrationCardInput,
  buildRegistrationCard,
  formatCardPhone,
  formatGuestCount,
  formatTimeOfDay,
  perNightTariff,
} from './registration-card';

const booking = (
  over: Partial<RegistrationCardBooking> = {},
): RegistrationCardBooking => ({
  bookingCode: 'V19-2611-0007',
  referenceNumber: 'BK-99',
  guestName: 'Prashanth N',
  guestEmail: 'guest@example.com',
  guestPhone: '9876543210',
  checkIn: '2026-11-15',
  checkOut: '2026-11-18',
  nights: 3,
  adults: 8,
  children: 2,
  infants: 0,
  baseAmountPaise: 5_400_000, // ₹54,000 for 3 nights
  extraGuestAmountPaise: 600_000, // ₹6,000
  discountAmountPaise: 0,
  specialRequests: null,
  ...over,
});

const input = (over: Partial<RegistrationCardInput> = {}) =>
  buildRegistrationCard({
    legal: {
      villaName: 'Villa 19',
      legalName: 'HABBAA SOLUTIONS PVT LTD',
      legalAddress: '209, Citadel Prism, Kodialbail, Mangalore 575003',
      gstin: '29AAICH1682G1ZD',
      supportEmail: 'reservations@habbaa.com',
      whatsappNumber: '+918050484123',
    },
    booking: booking(),
    rules: {
      checkInTime: '14:00:00',
      checkOutTime: '11:00:00',
      includedGuests: 8,
      maxGuests: 14,
    },
    company: null,
    guestGstin: null,
    govtIdType: null,
    paymentModes: [],
    ...over,
  });

describe('formatTimeOfDay', () => {
  it('reads the site 24-hour time as a 12-hour clock', () => {
    expect(formatTimeOfDay('14:00:00')).toBe('2:00 PM');
    expect(formatTimeOfDay('11:00:00')).toBe('11:00 AM');
    expect(formatTimeOfDay('00:30')).toBe('12:30 AM');
    expect(formatTimeOfDay('12:05:00')).toBe('12:05 PM');
  });

  it('returns null rather than a nonsense clock', () => {
    expect(formatTimeOfDay(null)).toBeNull();
    expect(formatTimeOfDay('')).toBeNull();
    expect(formatTimeOfDay('25:00')).toBeNull();
    expect(formatTimeOfDay('14:99')).toBeNull();
    expect(formatTimeOfDay('afternoon')).toBeNull();
  });
});

describe('formatCardPhone', () => {
  it('prints an Indian number as the letterhead does', () => {
    expect(formatCardPhone('+918050484123')).toBe('+91 8050484123');
    expect(formatCardPhone('8050484123')).toBe('+91 8050484123');
    expect(formatCardPhone('+91 80504 84123')).toBe('+91 8050484123');
  });

  it('leaves anything else exactly as stored', () => {
    expect(formatCardPhone('+14155550123')).toBe('+14155550123');
    expect(formatCardPhone(null)).toBeNull();
    expect(formatCardPhone('   ')).toBeNull();
  });
});

describe('formatGuestCount', () => {
  it('counts adults and children, and names infants only when present', () => {
    expect(formatGuestCount({ adults: 8, children: 2, infants: 0 })).toBe(
      '10 (8 adults, 2 children)',
    );
    expect(formatGuestCount({ adults: 1, children: 1, infants: 1 })).toBe(
      '2 (1 adult, 1 child, 1 infant)',
    );
    expect(formatGuestCount({ adults: 4, children: 0, infants: 0 })).toBe(
      '4 (4 adults)',
    );
  });
});

describe('perNightTariff', () => {
  it('states the charge per night, extra guests included, marked + GST', () => {
    // (54,000 + 6,000) / 3 = 20,000
    expect(perNightTariff(booking())).toBe('₹20,000 per night + GST');
  });

  it('takes the discount off first', () => {
    // (54,000 + 6,000 - 3,000) / 3 = 19,000
    expect(perNightTariff(booking({ discountAmountPaise: 300_000 }))).toBe(
      '₹19,000 per night + GST',
    );
  });

  it('rounds to the rupee when the nights do not divide evenly', () => {
    // 50,000 / 3 = 16,666.67 -> 16,667
    expect(
      perNightTariff(
        booking({
          baseAmountPaise: 5_000_000,
          extraGuestAmountPaise: 0,
        }),
      ),
    ).toBe('₹16,667 per night + GST');
  });

  it('prints nothing rather than a zero or a divide by zero', () => {
    expect(perNightTariff(booking({ nights: 0 }))).toBeNull();
    expect(
      perNightTariff(booking({ baseAmountPaise: 0, extraGuestAmountPaise: 0 })),
    ).toBeNull();
  });
});

describe('buildRegistrationCard', () => {
  it('prefills what the booking knows', () => {
    const card = input();

    expect(card.bookingId).toBe('V19-2611-0007');
    expect(card.guestName).toBe('Prashanth N');
    expect(card.email).toBe('guest@example.com');
    expect(card.mobile).toBe('+91 9876543210');
    expect(card.arrival).toBe('15 Nov 2026, 2:00 PM');
    expect(card.departure).toBe('18 Nov 2026, 11:00 AM');
    expect(card.numberOfGuests).toBe('10 (8 adults, 2 children)');
    expect(card.tariff).toBe('₹20,000 per night + GST');
  });

  it('leaves the fields the guest must complete blank', () => {
    const card = input();

    // No date of birth, address, nationality or ID number is stored, and the
    // card is what collects them.
    expect(card.govtIdType).toBeNull();
    expect(card.companyInfo).toBeNull();
    expect(card.remarks).toBeNull();
    // A security deposit is not the tariff advance; no amount is configured.
    expect(card.securityDeposit).toBeNull();
  });

  it('prints the ID type on file but never a number', () => {
    const card = input({ govtIdType: 'aadhaar' });

    expect(card.govtIdType).toBe('Aadhaar');
    expect(JSON.stringify(card)).not.toMatch(/X{4}|\d{12}/);
  });

  it('quotes the occupancy rule from the villa settings, not a fixed 14 / 8', () => {
    const card = input({
      rules: {
        checkInTime: '14:00:00',
        checkOutTime: '11:00:00',
        includedGuests: 6,
        maxGuests: 12,
      },
    });

    expect(card.occupancy).toEqual({ maxGuests: 12, includedGuests: 6 });
  });

  it('puts the company and its GSTIN in the company box', () => {
    const card = input({
      company: '  Habbaa Retail LLP  ',
      guestGstin: '29AAAAA0000A1Z5',
    });

    expect(card.companyInfo).toBe('Habbaa Retail LLP\nGSTIN: 29AAAAA0000A1Z5');
  });

  it('states a payment mode only when exactly one has been used', () => {
    expect(input({ paymentModes: [] }).modeOfPayment).toBeNull();
    expect(input({ paymentModes: ['upi'] }).modeOfPayment).toBe('UPI');
    expect(input({ paymentModes: ['upi', 'upi'] }).modeOfPayment).toBe('UPI');
    expect(input({ paymentModes: ['upi', 'cash'] }).modeOfPayment).toBeNull();
    // "Card", not the ledger's "Card (at the villa)": the guest filling this
    // in is already at the villa.
    expect(input({ paymentModes: ['card'] }).modeOfPayment).toBe('Card');
  });

  it('falls back to the reference number when there is no booking code', () => {
    expect(input({ booking: booking({ bookingCode: null }) }).bookingId).toBe(
      'BK-99',
    );
  });

  it('caps a long special request so the signature stays on the sheet', () => {
    const long = 'Please arrange '.repeat(40);
    const card = input({ booking: booking({ specialRequests: long }) });

    expect(card.remarks!.length).toBeLessThanOrEqual(160);
    expect(card.remarks!.endsWith('…')).toBe(true);
  });

  it('caps a long company name the same way', () => {
    const card = input({ company: 'Habbaa '.repeat(30) });

    const [line] = card.companyInfo!.split('\n');
    expect(line!.length).toBeLessThanOrEqual(70);
  });

  it('leaves an ID type we have no name for off the card', () => {
    expect(input({ govtIdType: 'driving_licence_new' }).govtIdType).toBeNull();
    expect(input({ govtIdType: 'passport' }).govtIdType).toBe('Passport');
  });

  it('skips a letterhead line the villa has not filled in', () => {
    const card = input({
      legal: {
        villaName: 'Villa 19',
        legalName: null,
        legalAddress: '   ',
        gstin: null,
        supportEmail: null,
        whatsappNumber: null,
      },
    });

    expect(card.letterhead).toEqual({
      villaName: 'Villa 19',
      legalName: null,
      legalAddress: null,
      phone: null,
      email: null,
      gstin: null,
    });
  });

  it('prints the check-in date alone when the villa has no times set', () => {
    const card = input({
      rules: {
        checkInTime: null,
        checkOutTime: null,
        includedGuests: 8,
        maxGuests: 14,
      },
    });

    expect(card.arrival).toBe('15 Nov 2026');
    expect(card.departure).toBe('18 Nov 2026');
  });

  it('populates salutation, first name, and last name from booking', () => {
    const card = input({
      booking: booking({
        salutation: 'Mr',
        firstName: 'Rahul',
        lastName: 'Sharma',
        guestName: 'Rahul Sharma',
      }),
    });

    expect(card.salutation).toBe('Mr');
    expect(card.firstName).toBe('Rahul');
    expect(card.lastName).toBe('Sharma');
    expect(card.guestName).toBe('Rahul Sharma');
  });
});
