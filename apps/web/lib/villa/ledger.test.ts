import { describe, expect, it } from 'vitest';

import { sitePaymentStatus, summariseLedger } from './ledger';

const base = {
  totalPaise: 2360000, // ₹23,600
  bookingStatus: 'confirmed',
  online: [],
  offline: [],
  refunds: [],
};

describe('summariseLedger', () => {
  it('starts unpaid', () => {
    expect(summariseLedger(base)).toMatchObject({
      status: 'unpaid',
      duePaise: 2360000,
    });
  });

  it('adds website and offline payments, ignoring void receipts and failed orders', () => {
    const s = summariseLedger({
      ...base,
      online: [
        { amountPaise: 1000000, status: 'captured' },
        { amountPaise: 999999, status: 'failed' },
      ],
      offline: [
        { amount: 5000, voided: false },
        { amount: 9999, voided: true },
      ],
    });
    expect(s).toMatchObject({
      onlinePaise: 1000000,
      offlinePaise: 500000,
      netPaidPaise: 1500000,
      duePaise: 860000,
      status: 'partially_paid',
    });
  });

  it('is paid when nothing is due, and shows any excess', () => {
    const s = summariseLedger({
      ...base,
      offline: [{ amount: 24000, voided: false }],
    });
    expect(s).toMatchObject({
      status: 'paid',
      duePaise: 0,
      excessPaise: 40000,
    });
  });

  it('subtracts refunds, never counting failed ones', () => {
    const s = summariseLedger({
      ...base,
      offline: [{ amount: 23600, voided: false }],
      refunds: [
        { amount: 600, status: 'processed' },
        { amount: 100, status: 'failed' },
      ],
    });
    expect(s).toMatchObject({
      refundedPaise: 60000,
      netPaidPaise: 2300000,
      status: 'partially_paid',
    });
  });

  it('is refunded when everything received went back', () => {
    const s = summariseLedger({
      ...base,
      bookingStatus: 'cancelled',
      online: [{ amountPaise: 500000, status: 'refunded' }],
      offline: [{ amount: 1000, voided: false }],
      refunds: [{ amount: 1000, status: 'processed' }],
    });
    expect(s.status).toBe('refunded');
  });

  it('a cancelled stay owes nothing more', () => {
    const s = summariseLedger({
      ...base,
      bookingStatus: 'cancelled',
      offline: [{ amount: 5000, voided: false }],
    });
    expect(s.duePaise).toBe(0);
  });

  it('works in paise: no floating-point drift', () => {
    const s = summariseLedger({
      ...base,
      totalPaise: 30,
      offline: [
        { amount: 0.1, voided: false },
        { amount: 0.2, voided: false },
      ],
    });
    expect(s.status).toBe('paid');
  });
});

describe('sitePaymentStatus', () => {
  it('holds back "paid" on the site until invoices move to check-out', () => {
    expect(sitePaymentStatus('paid')).toBe('partially_paid');
    expect(sitePaymentStatus('refunded')).toBe('refunded');
    expect(sitePaymentStatus('unpaid')).toBe('unpaid');
  });
});
