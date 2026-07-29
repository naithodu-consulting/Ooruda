import { NextResponse } from 'next/server';

import * as z from 'zod';

import { enhanceRouteHandler } from '@kit/next/routes';
import { getLogger } from '@kit/shared/logger';

import { getOrGenerateAdvanceApplicationPdf } from '~/home/[account]/billing/_lib/server/pdf-generation';

// Voucher numbers: new format PRM/26-27/MNT/000001 (slashes are percent-encoded in URLs).
// Legacy format ADV-MAIN-A1B2C3-A1 (alphanum + hyphens) also matches.
const voucherNoSchema = z
  .string()
  .max(64)
  .regex(/^[A-Z0-9/-]+$/i, 'Invalid voucher number format');

export const GET = enhanceRouteHandler(
  async function ({ params }) {
    const { voucherNo } = z
      .object({ voucherNo: voucherNoSchema })
      .parse(params);

    let pdf: Awaited<ReturnType<typeof getOrGenerateAdvanceApplicationPdf>>;

    try {
      pdf = await getOrGenerateAdvanceApplicationPdf(voucherNo);
    } catch (error) {
      const logger = await getLogger();
      logger.error(
        { voucherNo, error },
        'Advance application PDF route handler failed',
      );

      return NextResponse.json(
        { error: 'Could not generate the voucher PDF. Please try again.' },
        { status: 500 },
      );
    }

    if (!pdf) {
      return NextResponse.json(
        { error: 'Voucher not found.' },
        { status: 404 },
      );
    }

    if (pdf.signedUrl) {
      return NextResponse.redirect(pdf.signedUrl);
    }

    return new NextResponse(new Uint8Array(pdf.bytes!), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${pdf.filename}"`,
      },
    });
  },
  {
    auth: true,
  },
);
