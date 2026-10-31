import type { SupabaseClient } from '@supabase/supabase-js';

import { describe, expect, it, vi } from 'vitest';

import type { Database } from '~/lib/database.types';
import type { SiteBooking } from '~/lib/villa-db/bookings';
import type { VillaSite } from '~/lib/villa-db/client';

import { hasRecordedPayment } from './booking-payments';

/**
 * Website payments live on the booking site, so they are read through
 * listSitePayments rather than from Ooruda's own tables. Mocked at the module
 * boundary; the two Ooruda tables are served by the fake client below.
 */
const sitePayments = vi.hoisted(() =>
  vi.fn<() => Promise<{ amountPaise: number; status: string }[]>>(),
);

vi.mock('~/lib/villa-db/bookings', () => ({
  listSitePayments: sitePayments,
}));

type Row = Record<string, unknown>;

function fakeClient(tables: {
  villa_booking_payments?: { data?: Row[]; error?: { code: string } };
  villa_refunds?: { data?: Row[]; error?: { code: string } };
}) {
  return {
    from: (table: string) => {
      const result = tables[table as keyof typeof tables] ?? { data: [] };
      const builder = {
        select: () => builder,
        eq: () => builder,
        then: (resolve: (r: unknown) => unknown) =>
          Promise.resolve(
            resolve({ data: result.data ?? [], error: result.error }),
          ),
      };

      return builder;
    },
  } as unknown as SupabaseClient<Database>;
}

const site = {} as VillaSite;

const booking = {
  id: 'book-1',
  status: 'confirmed',
  totalAmountPaise: 1_652_000,
} as SiteBooking;

const check = (
  tables: Parameters<typeof fakeClient>[0],
  online: { amountPaise: number; status: string }[] = [],
) => {
  sitePayments.mockResolvedValue(online);

  return hasRecordedPayment(fakeClient(tables), site, 'prop-1', booking);
};

describe('hasRecordedPayment', () => {
  it('is false when nothing has been received', async () => {
    await expect(check({})).resolves.toBe(false);
  });

  it('counts an offline receipt', async () => {
    await expect(
      check({
        villa_booking_payments: { data: [{ amount: '5000', voided_at: null }] },
      }),
    ).resolves.toBe(true);
  });

  it('counts a website payment, which is not in our own tables', async () => {
    // The booking page shows these as "ON THE WEBSITE". A gate that read only
    // villa_booking_payments would call a fully-paid Razorpay booking unpaid.
    await expect(
      check({}, [{ amountPaise: 1_652_000, status: 'captured' }]),
    ).resolves.toBe(true);
  });

  it('ignores a voided receipt', async () => {
    await expect(
      check({
        villa_booking_payments: {
          data: [{ amount: '5000', voided_at: '2026-10-31T00:00:00Z' }],
        },
      }),
    ).resolves.toBe(false);
  });

  it('is false once the money has been fully refunded', async () => {
    await expect(
      check({
        villa_booking_payments: { data: [{ amount: '5000', voided_at: null }] },
        villa_refunds: { data: [{ amount: '5000', status: 'completed' }] },
      }),
    ).resolves.toBe(false);
  });

  it('is still true after a partial refund', async () => {
    await expect(
      check({
        villa_booking_payments: { data: [{ amount: '5000', voided_at: null }] },
        villa_refunds: { data: [{ amount: '2000', status: 'completed' }] },
      }),
    ).resolves.toBe(true);
  });

  it('fails closed when an Ooruda read errors', async () => {
    await expect(
      check({
        villa_booking_payments: { error: { code: '08006' } },
      }),
    ).resolves.toBe(false);
  });

  it('fails closed when the booking site will not answer', async () => {
    sitePayments.mockRejectedValue(new Error('unreachable'));

    await expect(
      hasRecordedPayment(fakeClient({}), site, 'prop-1', booking),
    ).resolves.toBe(false);
  });
});
