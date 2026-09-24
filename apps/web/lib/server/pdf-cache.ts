import 'server-only';
import { NextResponse, after } from 'next/server';

import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import { createHash } from 'node:crypto';

const BUCKET = 'billing-documents';

/**
 * Bump when a PDF template changes in a way that should invalidate every
 * content-addressed cached PDF (see `contentCachePath`).
 */
const PDF_TEMPLATE_VERSION = 1;

/**
 * Storage path for a PDF whose source row has no `pdf_url` column to record
 * a cached render in (advance deposits, cash-ledger payment receipts).
 *
 * The path is derived from a hash of everything the document prints that
 * comes from the source row (the entry, its unit and the association's
 * branding) plus the template version. Any edit to those produces a new path,
 * so a stale PDF is never served and no explicit invalidation is needed.
 */
export function contentCachePath(
  kind: string,
  associationId: string,
  id: string,
  source: unknown,
): string {
  const hash = createHash('sha256')
    .update(JSON.stringify(source))
    .update(`v${PDF_TEMPLATE_VERSION}`)
    .digest('hex')
    .slice(0, 16);

  return `${kind}/${associationId}/${id}-${hash}.pdf`;
}

/**
 * Signed URL for a cached PDF, or null when it hasn't been rendered yet.
 * Served as an attachment named `filename` (carried in the URL too, for the
 * client-side downloader).
 */
export async function signCachedPdfPath(
  path: string,
  filename: string,
): Promise<string | null> {
  const { data } = await getSupabaseServerAdminClient()
    .storage.from(BUCKET)
    .createSignedUrl(path, 300, { download: filename });

  return data?.signedUrl ?? null;
}

/**
 * Stores a freshly rendered PDF after the response has been sent, so the
 * download isn't held up by the upload.
 */
export function cachePdfInBackground(path: string, bytes: Buffer) {
  after(async () => {
    const { error } = await getSupabaseServerAdminClient()
      .storage.from(BUCKET)
      .upload(path, bytes, { contentType: 'application/pdf', upsert: true });

    if (error) {
      const logger = await getLogger();
      logger.error({ path, error }, 'Failed to cache rendered PDF in storage');
    }
  });
}

/** Attachment response for freshly rendered PDF bytes. */
export function pdfAttachmentResponse(bytes: Buffer, filename: string) {
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
