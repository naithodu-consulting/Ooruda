export const runtime = 'nodejs';

import { NextResponse, after } from 'next/server';

import { zip } from 'fflate';
import * as z from 'zod';

import { enhanceRouteHandler } from '@kit/next/routes';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  preprocessLogoForPdf,
  recordCachedBillPdf,
} from '~/home/[account]/billing/_lib/server/pdf-generation';
import { billTypeLabel } from '~/home/[account]/billing/_lib/unit-billing-types';
import { requireRole } from '~/lib/rbac';
import { loadPdfRenderer } from '~/lib/server/pdf-renderer';

import {
  fetchBulkBillData,
  renderBillFromPrefetch,
  type BulkBillRecord,
} from './bulk-render';

const BUCKET = 'billing-documents';
const RENDER_CONCURRENCY = 12;
const DOWNLOAD_CONCURRENCY = 30;

const BodySchema = z.object({
  billIds: z.array(z.string().uuid()).min(1).max(200),
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
 * Uploads freshly rendered bill PDFs to the Storage cache and records their
 * paths, after the response has been sent.
 */
function cacheRenderedBills(
  rendered: { bill: BulkBillRecord; bytes: Buffer }[],
) {
  if (rendered.length === 0) return;

  after(async () => {
    const admin = getSupabaseServerAdminClient();
    const cached: string[] = [];

    await withConcurrency(
      rendered,
      DOWNLOAD_CONCURRENCY,
      async ({ bill, bytes }) => {
        const storagePath = `bills/${bill.association_id}/${bill.id}.pdf`;
        const { error } = await admin.storage
          .from(BUCKET)
          .upload(storagePath, bytes, {
            contentType: 'application/pdf',
            upsert: true,
          });

        if (!error) {
          const { error: updateError } = await recordCachedBillPdf(
            bill,
            storagePath,
          );

          if (!updateError) cached.push(bill.id);
        }
      },
    );

    const logger = await getLogger();
    logger.debug(
      { cached: cached.length, rendered: rendered.length },
      'zip: cached freshly rendered bill PDFs',
    );
  });
}

function buildPath(bill: BulkBillRecord): string {
  const unitNo = bill.units?.unit_no ?? 'unknown';
  const typeLabel = billTypeLabel(bill.bill_type ?? 'maintenance').replace(
    /\s+/g,
    '-',
  );
  const billNoSafe = bill.bill_no.replace(/\//g, '-');
  return `unit-${unitNo}/${bill.period}-${typeLabel}-${billNoSafe}.pdf`;
}

export const POST = enhanceRouteHandler(
  async function ({ request }) {
    const t0 = performance.now();
    const logger = await getLogger();

    const body = BodySchema.parse(await request.json());
    const { billIds, accountSlug } = body;

    // ── Auth ─────────────────────────────────────────────────────────────────
    const tAuth0 = performance.now();
    const { accountId, associationId } = await requireRole(accountSlug, [
      'assoc_admin',
      'billing_operator',
    ]);

    // Start loading/warming the renderer in case any bill isn't cached yet.
    const rendererPromise = loadPdfRenderer();
    rendererPromise.catch(() => undefined);
    logger.debug(
      { ms: Math.round(performance.now() - tAuth0) },
      'zip/timing: requireRole',
    );

    const client = getSupabaseServerClient();
    const admin = getSupabaseServerAdminClient();

    // ── Fetch association (for logo URL and association ID) ───────────────────
    if (!associationId) {
      return NextResponse.json(
        { error: 'Association not found.' },
        { status: 404 },
      );
    }

    // The branding (for the logo) and the bill data are independent - one
    // parallel stage.
    const tFetch0 = performance.now();
    const [{ data: association }, { bills, lookups }] = await Promise.all([
      client
        .from('associations')
        .select('id, accounts(picture_url)')
        .eq('account_id', accountId)
        .single(),
      fetchBulkBillData(billIds, associationId, admin),
    ]);
    logger.debug(
      { ms: Math.round(performance.now() - tFetch0), count: bills.length },
      'zip/timing: association + fetchBulkBillData',
    );

    const tLogo0 = performance.now();
    const logoPromise = preprocessLogoForPdf(
      (association?.accounts as { picture_url: string | null } | null)
        ?.picture_url,
    ).then((r) => {
      logger.debug(
        { ms: Math.round(performance.now() - tLogo0) },
        'zip/timing: preprocessLogoForPdf',
      );
      return r;
    });

    if (bills.length === 0) {
      return NextResponse.json(
        { error: 'No matching bills found.' },
        { status: 404 },
      );
    }

    const withPdf = bills.filter((b) => b.pdf_url);
    const uncached = bills.filter((b) => !b.pdf_url);
    logger.debug(
      { cached: withPdf.length, uncached: uncached.length },
      'zip/timing: cache split',
    );

    const files: Record<string, Uint8Array> = {};
    // Bills that failed the cache path are collected here and rendered instead.
    const cacheFallbacks: BulkBillRecord[] = [];

    // ── Fast path: serve cached PDFs from Storage ─────────────────────────────
    if (withPdf.length > 0) {
      const tSign0 = performance.now();
      const { data: signed } = await admin.storage
        .from(BUCKET)
        .createSignedUrls(
          withPdf.map((b) => b.pdf_url!),
          300,
        );
      logger.debug(
        { ms: Math.round(performance.now() - tSign0), count: withPdf.length },
        'zip/timing: createSignedUrls',
      );

      const urlByPath = new Map(
        (signed ?? [])
          .filter((s) => s.signedUrl)
          .map((s) => [s.path, s.signedUrl!]),
      );

      const tDl0 = performance.now();
      await withConcurrency(withPdf, DOWNLOAD_CONCURRENCY, async (bill) => {
        const url = urlByPath.get(bill.pdf_url!);
        if (!url) {
          cacheFallbacks.push(bill);
          return;
        }
        // Bounded, so one slow object can't stall the whole export - it is
        // rendered instead.
        const res = await fetch(url, {
          signal: AbortSignal.timeout(10_000),
        }).catch(() => null);
        if (!res?.ok) {
          cacheFallbacks.push(bill);
          return;
        }
        files[buildPath(bill)] = new Uint8Array(await res.arrayBuffer());
      });
      logger.debug(
        {
          ms: Math.round(performance.now() - tDl0),
          downloaded: Object.keys(files).length,
          fallbacks: cacheFallbacks.length,
        },
        'zip/timing: download cached PDFs',
      );
    }

    const needsGeneration = [...uncached, ...cacheFallbacks];

    // ── Render path: generate PDFs using pre-fetched data (zero per-bill DB calls) ─
    if (needsGeneration.length > 0) {
      const logoDataUri = await logoPromise;
      const renderTimes: number[] = [];
      const rendered: { bill: BulkBillRecord; bytes: Buffer }[] = [];
      const tRender0 = performance.now();

      await withConcurrency(
        needsGeneration,
        RENDER_CONCURRENCY,
        async (bill) => {
          const tBill0 = performance.now();
          const buf = await renderBillFromPrefetch(
            bill,
            logoDataUri,
            lookups,
            await rendererPromise,
          );
          const billMs = Math.round(performance.now() - tBill0);
          renderTimes.push(billMs);
          logger.debug(
            {
              ms: billMs,
              billId: bill.id,
              bill_type: bill.bill_type,
              bill_no: bill.bill_no,
            },
            'zip/timing: render single bill',
          );
          if (buf) {
            files[buildPath(bill)] = new Uint8Array(buf);
            rendered.push({ bill, bytes: buf });
          }
        },
      );

      // Cache what was just rendered so the next export (and single
      // downloads) are signed-URL hits - after the response is sent.
      cacheRenderedBills(rendered);

      const totalRenderMs = Math.round(performance.now() - tRender0);
      const avgMs = renderTimes.length
        ? Math.round(
            renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length,
          )
        : 0;
      const maxMs = renderTimes.length ? Math.max(...renderTimes) : 0;
      logger.debug(
        { totalMs: totalRenderMs, avgMs, maxMs, count: needsGeneration.length },
        'zip/timing: all renders complete',
      );
    }

    if (Object.keys(files).length === 0) {
      return NextResponse.json(
        { error: 'No PDFs could be generated.' },
        { status: 500 },
      );
    }

    const tZip0 = performance.now();
    const zipped = await new Promise<Uint8Array>((resolve, reject) => {
      // PDFs are already compressed; storing them (level 0) is several times
      // faster than deflating them again and barely changes the size.
      zip(files, { level: 0 }, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    logger.debug(
      { ms: Math.round(performance.now() - tZip0) },
      'zip/timing: fflate zip',
    );

    const totalMs = Math.round(performance.now() - t0);
    logger.debug(
      {
        totalMs,
        billCount: bills.length,
        fileCount: Object.keys(files).length,
      },
      'zip/timing: TOTAL',
    );

    const date = new Date().toISOString().slice(0, 10);
    const filename = `bills-${bills.length}bills-${date}.zip`;

    return new NextResponse(zipped as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  },
  { auth: true },
);
