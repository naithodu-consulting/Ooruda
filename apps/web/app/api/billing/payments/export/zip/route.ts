import { NextResponse, after } from 'next/server';

import { zip } from 'fflate';
import * as z from 'zod';

import { enhanceRouteHandler } from '@kit/next/routes';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import { getOrGenerateAdvanceApplicationPdf } from '~/home/[account]/billing/_lib/server/pdf-generation';
import { preprocessLogoForPdf } from '~/home/[account]/billing/_lib/server/pdf-generation';
import { requireRole } from '~/lib/rbac';
import { loadPdfRenderer } from '~/lib/server/pdf-renderer';

import {
  fetchBulkReceiptData,
  renderReceiptFromPrefetch,
  type BulkPaymentRecord,
} from './bulk-render';

export const runtime = 'nodejs';

const BUCKET = 'billing-documents';
const RENDER_CONCURRENCY = 12;
const DOWNLOAD_CONCURRENCY = 30;

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

/**
 * Uploads freshly rendered receipt PDFs to the Storage cache and records
 * their paths, after the response has been sent.
 */
function cacheRenderedReceipts(
  associationId: string,
  rendered: { payment: BulkPaymentRecord; bytes: Buffer }[],
) {
  const cacheable = rendered.filter((r) => r.payment.receipt_id);
  if (cacheable.length === 0) return;

  after(async () => {
    const admin = getSupabaseServerAdminClient();

    await withConcurrency(
      cacheable,
      DOWNLOAD_CONCURRENCY,
      async ({ payment, bytes }) => {
        const storagePath = `receipts/${associationId}/${payment.id}.pdf`;
        const { error } = await admin.storage
          .from(BUCKET)
          .upload(storagePath, bytes, {
            contentType: 'application/pdf',
            upsert: true,
          });

        if (!error) {
          await admin
            .from('receipts')
            .update({ pdf_url: storagePath })
            .eq('id', payment.receipt_id!);
        }
      },
    );
  });
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
    // requireRole also resolves the association, which scopes every query
    // below - a caller can't request payments from another association.
    const { associationId } = await requireRole(accountSlug, [
      'assoc_admin',
      'billing_operator',
    ]);

    if (!associationId) {
      return NextResponse.json(
        { error: 'Association not found.' },
        { status: 403 },
      );
    }

    const admin = getSupabaseServerAdminClient();

    // Start loading/warming the renderer in case anything isn't cached yet.
    const rendererPromise = loadPdfRenderer();
    rendererPromise.catch(() => undefined);

    const files: Record<string, Uint8Array> = {};

    // Receipts and advance vouchers are independent - build them in parallel.
    await Promise.all([
      paymentIds.length > 0 ? addPaymentReceipts() : null,
      advanceVoucherNos.length > 0 ? addAdvanceVouchers() : null,
    ]);

    // ── Cash payment receipts ─────────────────────────────────────────────────
    // Cached receipts are downloaded from Storage; only the rest are rendered,
    // and those are cached (after the response) for next time.
    async function addPaymentReceipts() {
      const tFetch0 = performance.now();
      const { payments, lookups, association, associationLogoUrl } =
        await fetchBulkReceiptData(paymentIds, associationId!, admin);
      logger.debug(
        { ms: Math.round(performance.now() - tFetch0), count: payments.length },
        'zip-receipts/timing: fetchBulkReceiptData',
      );

      if (payments.length === 0) return;

      const logoPromise = preprocessLogoForPdf(associationLogoUrl);

      const cached = payments.filter((p) => p.receipt_pdf_url);
      const needsRender = payments.filter((p) => !p.receipt_pdf_url);

      if (cached.length > 0) {
        const tSign0 = performance.now();
        const { data: signed } = await admin.storage
          .from(BUCKET)
          .createSignedUrls(
            cached.map((p) => p.receipt_pdf_url!),
            300,
          );
        logger.debug(
          { ms: Math.round(performance.now() - tSign0), count: cached.length },
          'zip-receipts/timing: createSignedUrls',
        );
        const urlByPath = new Map(
          (signed ?? [])
            .filter((s) => s.signedUrl)
            .map((s) => [s.path, s.signedUrl!]),
        );

        const tDl0 = performance.now();
        await withConcurrency(cached, DOWNLOAD_CONCURRENCY, async (payment) => {
          const url = urlByPath.get(payment.receipt_pdf_url!);
          // Bounded, so one slow object can't stall the whole export.
          const res = url
            ? await fetch(url, { signal: AbortSignal.timeout(10_000) }).catch(
                () => null,
              )
            : null;

          if (res?.ok) {
            files[buildPath(payment)] = new Uint8Array(await res.arrayBuffer());
          } else {
            // Missing from Storage - render it instead.
            needsRender.push(payment);
          }
        });
        logger.debug(
          { ms: Math.round(performance.now() - tDl0), count: cached.length },
          'zip-receipts/timing: download cached PDFs',
        );
      }

      if (needsRender.length === 0) return;

      const tReady0 = performance.now();
      const [logoDataUri, renderer] = await Promise.all([
        logoPromise,
        rendererPromise,
      ]);
      logger.debug(
        { ms: Math.round(performance.now() - tReady0) },
        'zip-receipts/timing: logo + renderer ready',
      );
      const rendered: { payment: BulkPaymentRecord; bytes: Buffer }[] = [];

      const tRender0 = performance.now();
      await withConcurrency(
        needsRender,
        RENDER_CONCURRENCY,
        async (payment) => {
          const buf = await renderReceiptFromPrefetch(
            payment,
            logoDataUri,
            association,
            lookups,
            renderer,
          );
          if (buf) {
            files[buildPath(payment)] = new Uint8Array(buf);
            rendered.push({ payment, bytes: buf });
          }
        },
      );
      logger.debug(
        {
          ms: Math.round(performance.now() - tRender0),
          count: needsRender.length,
          cached: cached.length,
        },
        'zip-receipts/timing: cash receipts rendered',
      );

      cacheRenderedReceipts(associationId!, rendered);
    }

    // ── Advance application vouchers ──────────────────────────────────────────
    async function addAdvanceVouchers() {
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
              // voucherNo alone is unique; unit_no requires another fetch - skip folder grouping
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
      // PDFs are already compressed; storing them (level 0) is several times
      // faster than deflating them again and barely changes the size.
      zip(files, { level: 0 }, (err, data) => {
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
