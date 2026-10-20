import { type APIResponse, expect, test } from '@playwright/test';

import { FIX, SLUG, authFile, uniqueClientIp } from './helpers';

/** Asserts a PDF/ZIP download and returns how long it took. */
async function expectFile(
  res: APIResponse,
  kind: 'pdf' | 'zip',
  label: string,
) {
  expect(res.status(), `${label} status`).toBe(200);
  const body = await res.body();
  const magic = body.subarray(0, 4).toString('latin1');
  expect(magic, `${label} file signature`).toBe(
    kind === 'pdf' ? '%PDF' : 'PK\u0003\u0004',
  );

  // Name comes from Content-Disposition (fresh render) or the signed URL's
  // download param (cached). Either way: no slashes / percent-escapes.
  const cd = res.headers()['content-disposition'] ?? '';
  const fromHeader = cd.match(/filename="([^"]+)"/)?.[1];
  const fromUrl = new URL(res.url()).searchParams.get('download');
  const name = fromHeader ?? (fromUrl ? decodeURIComponent(fromUrl) : '');
  expect(name, `${label} filename`).toMatch(new RegExp(`\\.${kind}$`));
  expect(name, `${label} filename is clean`).not.toMatch(/[/\\%]/);
}

async function timed<T>(fn: () => Promise<T>) {
  const t0 = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - t0 };
}

test.describe('admin downloads', () => {
  test.use({ storageState: authFile('admin') });

  test('bill PDF (twice: render then cache)', async ({ request }) => {
    const url = `/api/billing/bills/${FIX.otherBillId}/pdf`;
    const first = await timed(() => request.get(url));
    await expectFile(first.value, 'pdf', 'bill #1');
    const second = await timed(() => request.get(url));
    await expectFile(second.value, 'pdf', 'bill #2');
    test.info().annotations.push({
      type: 'timing',
      description: `bill pdf: ${first.ms}ms then ${second.ms}ms`,
    });
    expect.soft(second.ms, 'repeat download time').toBeLessThan(3000);
  });

  test('receipt PDF', async ({ request }) => {
    const r = await timed(() =>
      request.get(`/api/billing/receipts/${FIX.receiptPaymentId}/pdf`),
    );
    await expectFile(r.value, 'pdf', 'receipt');
    test
      .info()
      .annotations.push({ type: 'timing', description: `receipt: ${r.ms}ms` });
  });

  test('expenses export PDF', async ({ request }) => {
    const r = await request.post('/api/expenses/export/pdf', {
      data: { associationId: FIX.associationId },
    });
    await expectFile(r, 'pdf', 'expenses export');
  });

  test('bills ZIP', async ({ request }) => {
    const r = await timed(() =>
      request.post('/api/billing/bills/export/zip', {
        data: {
          billIds: [FIX.otherBillId, FIX.ownerBillId],
          accountSlug: SLUG,
        },
      }),
    );
    await expectFile(r.value, 'zip', 'bills zip');
    test.info().annotations.push({
      type: 'timing',
      description: `bills zip: ${r.ms}ms`,
    });
  });

  test('receipts ZIP', async ({ request }) => {
    const r = await request.post('/api/billing/payments/export/zip', {
      data: {
        paymentIds: [FIX.receiptPaymentId],
        advanceVoucherNos: [],
        accountSlug: SLUG,
      },
    });
    await expectFile(r, 'zip', 'receipts zip');
  });

  test('statement PDF is owner/tenant only', async ({ request }) => {
    const r = await request.get(
      `/api/billing/statement/pdf?account=${SLUG}&fy=2026-27&type=all`,
    );
    expect(r.status()).toBe(404); // admin has no units of their own
  });
});

test.describe('owner downloads', () => {
  test.use({ storageState: authFile('owner') });

  test('own bill PDF', async ({ request }) => {
    const r = await request.get(`/api/billing/bills/${FIX.ownerBillId}/pdf`);
    await expectFile(r, 'pdf', 'own bill');
  });

  test("another unit's bill is not served", async ({ request }) => {
    const r = await request.get(`/api/billing/bills/${FIX.otherBillId}/pdf`, {
      maxRedirects: 0,
    });
    expect(r.status()).toBe(404);
  });

  test('statement PDF for each owned unit', async ({ request }) => {
    for (const unitId of [FIX.ownerUnitId, FIX.ownerUnitId2]) {
      const r = await request.get(
        `/api/billing/statement/pdf?account=${SLUG}&unit_id=${unitId}&fy=2026-27&type=all`,
      );
      await expectFile(r, 'pdf', `statement ${unitId}`);
    }
  });

  test('cannot export bills in bulk', async ({ request }) => {
    const r = await request.post('/api/billing/bills/export/zip', {
      data: { billIds: [FIX.ownerBillId], accountSlug: SLUG },
      maxRedirects: 0,
    });
    expect(r.status()).not.toBe(200);
  });
});

test.describe('tenant downloads', () => {
  test.use({ storageState: authFile('tenant') });

  test("an owner's bill is not served to a tenant without tenancy", async ({
    request,
  }) => {
    const r = await request.get(`/api/billing/bills/${FIX.ownerBillId}/pdf`, {
      maxRedirects: 0,
    });
    expect(r.status()).toBe(404);
  });
});

test.describe('signed out', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders({ 'x-forwarded-for': uniqueClientIp() });
  });

  test('PDF routes require sign in', async ({ request }) => {
    const r = await request.get(`/api/billing/bills/${FIX.otherBillId}/pdf`, {
      maxRedirects: 0,
    });
    expect(r.status()).not.toBe(200);
  });
});
