import { describe, expect, it } from 'vitest';

import { isPhoneEmpty, normalizePhoneNumber } from '@kit/shared/utils';

import {
  EnrichChannelStaySchema,
  NewBookingFormSchema,
} from '../../app/[locale]/home/[account]/bookings/_lib/schemas/bookings.schema';
import { RecordIdSchema } from '../../app/[locale]/home/[account]/bookings/_lib/schemas/guests.schema';

describe('Phone & Email Validations', () => {
  describe('isPhoneEmpty', () => {
    it('treats null, undefined, empty string, and bare calling codes as empty', () => {
      expect(isPhoneEmpty(null)).toBe(true);
      expect(isPhoneEmpty(undefined)).toBe(true);
      expect(isPhoneEmpty('')).toBe(true);
      expect(isPhoneEmpty('   ')).toBe(true);
      expect(isPhoneEmpty('+')).toBe(true);
      expect(isPhoneEmpty('+91')).toBe(true);
      expect(isPhoneEmpty('+1')).toBe(true);
      expect(isPhoneEmpty('+44')).toBe(true);
    });

    it('treats phone numbers with national digits as non-empty', () => {
      expect(isPhoneEmpty('+919876543210')).toBe(false);
      expect(isPhoneEmpty('9876543210')).toBe(false);
      expect(isPhoneEmpty('+14155552671')).toBe(false);
      expect(isPhoneEmpty('+91123')).toBe(false);
    });
  });

  describe('normalizePhoneNumber', () => {
    it('validates 10-digit Indian mobile numbers', () => {
      expect(normalizePhoneNumber('9876543210')).toBe('+919876543210');
      expect(normalizePhoneNumber('+919876543210')).toBe('+919876543210');
      expect(normalizePhoneNumber('+91 98765 43210')).toBe('+919876543210');
    });

    it('validates international phone numbers', () => {
      expect(normalizePhoneNumber('+14155552671')).toBe('+14155552671');
      expect(normalizePhoneNumber('+447911123456')).toBe('+447911123456');
    });

    it('rejects incomplete or invalid numbers', () => {
      expect(normalizePhoneNumber('12345')).toBeNull();
      expect(normalizePhoneNumber('+9112345')).toBeNull();
      expect(normalizePhoneNumber('+910000000000')).toBeNull();
      expect(normalizePhoneNumber('+91')).toBeNull();
      expect(normalizePhoneNumber('abcdefghij')).toBeNull();
    });
  });

  describe('NewBookingFormSchema (Direct Booking)', () => {
    const baseValidBooking = {
      accountId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      propertyId: 'b2c3d4e5-f6a1-4b2c-8d3e-4f5a6b7c8d9e',
      checkIn: '2026-12-01',
      checkOut: '2026-12-02',
      overrideCutoff: false,
      adults: 2,
      children: 0,
      infants: 0,
      salutation: 'Mr',
      firstName: 'Rahul',
      lastName: 'Sharma',
      guestPhone: '+919876543210',
      guestEmail: 'rahul.sharma@example.com',
      channel: 'phone',
      paymentStatus: 'unpaid',
      amountReceived: 0,
      paymentMode: 'upi',
      paymentReference: '',
      specialRequests: '',
      isEvent: false,
    };

    it('accepts valid phone and email', () => {
      const res = NewBookingFormSchema.safeParse(baseValidBooking);
      expect(res.success).toBe(true);
    });

    it('rejects empty or bare country code phone', () => {
      const emptyRes = NewBookingFormSchema.safeParse({
        ...baseValidBooking,
        guestPhone: '',
      });
      expect(emptyRes.success).toBe(false);

      const bareRes = NewBookingFormSchema.safeParse({
        ...baseValidBooking,
        guestPhone: '+91',
      });
      expect(bareRes.success).toBe(false);
    });

    it('rejects invalid phone numbers', () => {
      const res = NewBookingFormSchema.safeParse({
        ...baseValidBooking,
        guestPhone: '+9112345',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('valid phone number');
      }
    });

    it('rejects invalid email formats', () => {
      for (const badEmail of [
        'notanemail',
        'test@',
        'test@domain',
        'test@.com',
        '',
      ]) {
        const res = NewBookingFormSchema.safeParse({
          ...baseValidBooking,
          guestEmail: badEmail,
        });
        expect(res.success).toBe(false);
      }
    });
  });

  describe('EnrichChannelStaySchema (Airbnb / OTA Enrichment)', () => {
    const baseValidEnrich = {
      accountId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      propertyId: 'b2c3d4e5-f6a1-4b2c-8d3e-4f5a6b7c8d9e',
      feedId: 'c3d4e5f6-a1b2-4c3d-8e4f-5a6b7c8d9e0f',
      externalUid: 'airbnb-uid-1',
      checkIn: '2026-12-01',
      checkOut: '2026-12-05',
      salutation: 'Mr',
      firstName: 'Priya',
      lastName: 'Patel',
      guestPhone: '',
      guestEmail: '',
      adults: 2,
      children: 0,
      infants: 0,
      totalAmount: 15000,
      specialRequests: '',
    };

    it('accepts empty optional phone and email', () => {
      const res = EnrichChannelStaySchema.safeParse(baseValidEnrich);
      expect(res.success).toBe(true);
    });

    it('accepts bare +91 calling code when left untouched in phone input', () => {
      const res = EnrichChannelStaySchema.safeParse({
        ...baseValidEnrich,
        guestPhone: '+91',
      });
      expect(res.success).toBe(true);
    });

    it('validates phone when provided', () => {
      const validRes = EnrichChannelStaySchema.safeParse({
        ...baseValidEnrich,
        guestPhone: '+919876543210',
      });
      expect(validRes.success).toBe(true);

      const invalidRes = EnrichChannelStaySchema.safeParse({
        ...baseValidEnrich,
        guestPhone: '+91123',
      });
      expect(invalidRes.success).toBe(false);
    });

    it('validates email when provided', () => {
      const validRes = EnrichChannelStaySchema.safeParse({
        ...baseValidEnrich,
        guestEmail: 'priya@example.com',
      });
      expect(validRes.success).toBe(true);

      const invalidRes = EnrichChannelStaySchema.safeParse({
        ...baseValidEnrich,
        guestEmail: 'invalid-email',
      });
      expect(invalidRes.success).toBe(false);
    });
  });

  describe('RecordIdSchema (Guest ID Registration)', () => {
    const baseValidRecordId = {
      accountId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      propertyId: 'b2c3d4e5-f6a1-4b2c-8d3e-4f5a6b7c8d9e',
      bookingId: 'c3d4e5f6-a1b2-4c3d-8e4f-5a6b7c8d9e0f',
      guestId: '',
      newGuestSalutation: 'Mr',
      newGuestFirstName: 'Amit',
      newGuestLastName: 'Verma',
      newGuestPhone: '',
      isAdult: true,
      docType: 'aadhaar' as const,
      idNumber: '1234',
      stage: 'soft_copy' as const,
    };

    it('allows empty or bare +91 phone', () => {
      expect(RecordIdSchema.safeParse(baseValidRecordId).success).toBe(true);
      expect(
        RecordIdSchema.safeParse({
          ...baseValidRecordId,
          newGuestPhone: '+91',
        }).success,
      ).toBe(true);
    });

    it('validates phone format if entered', () => {
      expect(
        RecordIdSchema.safeParse({
          ...baseValidRecordId,
          newGuestPhone: '+919876543210',
        }).success,
      ).toBe(true);

      expect(
        RecordIdSchema.safeParse({
          ...baseValidRecordId,
          newGuestPhone: '+91123',
        }).success,
      ).toBe(false);
    });
  });
});
