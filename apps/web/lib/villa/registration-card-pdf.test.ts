import { describe, expect, it } from 'vitest';

import { renderRegistrationCardPdf } from '@kit/pdf-templates';

describe('renderRegistrationCardPdf', () => {
  it('renders villa19 template to buffer', async () => {
    const data = {
      bookingId: 'V19-TEST',
      letterhead: { villaName: 'Villa 19' },
      guestName: 'Prashanth N',
      salutation: 'Mr',
      firstName: 'Prashanth',
      lastName: 'N',
      companyInfo: null,
      email: 'test@example.com',
      mobile: '+919999999999',
      govtIdType: 'Aadhaar',
      arrival: '1 Nov 2026',
      departure: '5 Nov 2026',
      numberOfGuests: '8 Adults',
      modeOfPayment: 'Airbnb',
      securityDeposit: '₹5,000',
      tariff: 'Airbnb',
      remarks: 'late checkout',
      checkInDateFormatted: '1 Nov 2026',
      occupancy: { maxGuests: 14, includedGuests: 8 },
    };

    const pdf = await renderRegistrationCardPdf('villa19', data as any);
    expect(pdf).toBeDefined();
    expect(pdf.length).toBeGreaterThan(100);
  });
});
