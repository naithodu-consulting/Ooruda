import { NextResponse } from 'next/server';

import * as z from 'zod';

import { enhanceRouteHandler } from '@kit/next/routes';
import { getLogger } from '@kit/shared/logger';

import { getOrGenerateReceiptPdf } from '~/home/[account]/billing/_lib/server/pdf-generation';

export const GET = enhanceRouteHandler(
  async function ({ params }) {
    const { paymentId } = z
      .object({ paymentId: z.string().uuid() })
      .parse(params);

    let pdf: Awaited<ReturnType<typeof getOrGenerateReceiptPdf>>;

    try {
      pdf = await getOrGenerateReceiptPdf(paymentId);
    } catch (error) {
      const logger = await getLogger();
      logger.error({ paymentId, error }, 'Receipt PDF route handler failed');

      return NextResponse.json(
        { error: 'Could not generate the receipt PDF. Please try again.' },
        { status: 500 },
      );
    }

    if (!pdf) {
      return NextResponse.json(
        { error: 'Receipt not found.' },
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
