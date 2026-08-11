export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

import { zip } from 'fflate';
import * as z from 'zod';

import { enhanceRouteHandler } from '@kit/next/routes';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import { getOrGenerateAdvanceApplicationPdf } from '~/home/[account]/billing/_lib/server/pdf-generation';
import { preprocessLogoForPdf } from '~/home/[account]/billing/_lib/server/pdf-generation';
import { requireRole } from '~/lib/rbac';

import {
  fetchBulkReceiptData,
  renderReceiptFromPrefetch,
  type BulkPaymentRecord,
} from './bulk-render';

const RENDER_CONCURRENCY = 12;

const BodySchema = z.object({
  paymentIds: z.array(z.string().uuid()).max(500).default([]),
  advanceVoucherNos: z.array(z.string().max(64)).max(200).default([]),
  accountSlug: z.string(),
});

/** Run `fn` over `items` with at most `limit` concurrent executions. */
async function withConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const iter = items[Symbol.iterator]();
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (let next = iter.next(); !next.done; next = iter.next()) {
        await fn(next.value);
      }
    },
  );
  await Promise.all(workers);
}

function buildPath(payment: BulkPaymentRecord): string {
  const receiptNo =
    payment.receipt_no ?? `RCP-${payment.id.slice(0, 8).toUpperCase()}`;
  const receiptSafe = receiptNo.replace(/\//g, '-');
  return `unit-${payment.unit_no}/${receiptSafe}.pdf`;
}

export const POST = enhanceRouteHandler(
  async function ({ request }) {
    const t0 = performance.now();
    const logger = await getLogger();

    const body = BodySchema.parse(await request.json());
    const { paymentIds, advanceVoucherNos, accountSlug } = body;

    if (paymentIds.length === 0 && advanceVoucherNos.length === 0) {
      return NextResponse.json(
        { error: 'No receipts requested.' },
        { status: 400 },
      );
    }

    // ── Auth ──────────────────────────────────────────────────────────────────
    const { accountId } = await requireRole(accountSlug, [
      'assoc_admin',
      'billing_operator',
    ]);

    const admin = getSupabaseServerAdminClient();

    // Resolve association_id so we can scope all queries — prevents a caller
    // from requesting payment IDs belonging to a different association.
    const { data: assocRow } = await admin
      .from('associations')
      .select('id')
      .eq('account_id', accountId)
      .single();
    if (!assocRow) {
      return NextResponse.json(
        { error: 'Association not found.' },
        { status: 403 },
      );
    }
    const associationId = assocRow.id;

    const files: Record<string, Uint8Array> = {};

    // ── Cash payment receipts ─────────────────────────────────────────────────
    if (paymentIds.length > 0) {
      const tFetch0 = performance.now();
      const { payments, lookups, association, associationLogoUrl } =
        await fetchBulkReceiptData(paymentIds, associationId, admin);
      logger.debug(
        { ms: Math.round(performance.now() - tFetch0), count: payments.length },
        'zip-receipts/timing: fetchBulkReceiptData',
      );

      if (payments.length > 0) {
        const logoDataUri = await preprocessLogoForPdf(associationLogoUrl);

        const tRender0 = performance.now();
        await withConcurrency(payments, RENDER_CONCURRENCY, async (payment) => {
          const buf = await renderReceiptFromPrefetch(
            payment,
            logoDataUri,
            association,
            lookups,
          );
          if (buf) files[buildPath(payment)] = new Uint8Array(buf);
        });
        logger.debug(
          {
            ms: Math.round(performance.now() - tRender0),
            count: payments.length,
          },
          'zip-receipts/timing: cash receipts rendered',
        );
      }
    }

    // ── Advance application vouchers ──────────────────────────────────────────
    if (advanceVoucherNos.length > 0) {
      const tAdv0 = performance.now();
      await withConcurrency(
        advanceVoucherNos,
        RENDER_CONCURRENCY,
        async (voucherNo) => {
          try {
            const pdf = await getOrGenerateAdvanceApplicationPdf(voucherNo);
            if (!pdf) return;

            let bytes: Uint8Array | null = null;
            if (pdf.bytes) {
              bytes = new Uint8Array(pdf.bytes);
            } else if (pdf.signedUrl) {
              const res = await fetch(pdf.signedUrl);
              if (res.ok) bytes = new Uint8Array(await res.arrayBuffer());
            }

            if (bytes) {
              // voucherNo alone is unique; unit_no requires another fetch — skip folder grouping
              files[`advance-vouchers/${voucherNo.replace(/\//g, '-')}.pdf`] =
                bytes;
            }
          } catch (err) {
            logger.error(
              { voucherNo, err },
              'zip-receipts: advance voucher render failed',
            );
          }
        },
      );
      logger.debug(
        {
          ms: Math.round(performance.now() - tAdv0),
          count: advanceVoucherNos.length,
        },
        'zip-receipts/timing: advance vouchers',
      );
    }

    if (Object.keys(files).length === 0) {
      return NextResponse.json(
        { error: 'No receipts could be generated.' },
        { status: 500 },
      );
    }

    const zipped = await new Promise<Uint8Array>((resolve, reject) => {
      zip(files, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const totalMs = Math.round(performance.now() - t0);
    const totalCount = paymentIds.length + advanceVoucherNos.length;
    logger.debug(
      { totalMs, totalCount, fileCount: Object.keys(files).length },
      'zip-receipts/timing: TOTAL',
    );

    const date = new Date().toISOString().slice(0, 10);
    const filename = `receipts-${Object.keys(files).length}receipts-${date}.zip`;

    return new NextResponse(zipped as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  },
  { auth: true },
);
