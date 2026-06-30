import { NextResponse } from 'next/server';

import * as z from 'zod';

import { enhanceRouteHandler } from '@kit/next/routes';
import { getLogger } from '@kit/shared/logger';

import { getOrGenerateBillPdf } from '~/home/[account]/billing/_lib/server/pdf-generation';

export const GET = enhanceRouteHandler(
  async function ({ params }) {
    const { billId } = z.object({ billId: z.string().uuid() }).parse(params);

    let pdf: Awaited<ReturnType<typeof getOrGenerateBillPdf>>;

    try {
      pdf = await getOrGenerateBillPdf(billId);
    } catch (error) {
      const logger = await getLogger();
      logger.error({ billId, error }, 'Bill PDF route handler failed');

      return NextResponse.json(
        { error: 'Could not generate the bill PDF. Please try again.' },
        { status: 500 },
      );
    }

    if (!pdf) {
      return NextResponse.json({ error: 'Bill not found.' }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(pdf.bytes), {
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
