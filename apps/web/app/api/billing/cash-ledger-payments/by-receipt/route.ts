import * as z from 'zod';

import { enhanceRouteHandler } from '@kit/next/routes';

import { serveCashLedgerReceipt } from '../_lib/serve-cash-ledger-receipt';

export const runtime = 'nodejs';

// ?receipt_no=PRM%2F26-27%2FMNT%2F000001
// Using query params avoids path-segment slash-encoding complexity.
const querySchema = z.object({
  receipt_no: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9/_-]+$/, 'Invalid receipt number'),
});

export const GET = enhanceRouteHandler(
  async function ({ request, user }) {
    const url = new URL(request.url);
    const { receipt_no } = querySchema.parse(
      Object.fromEntries(url.searchParams),
    );

    return serveCashLedgerReceipt({
      userId: user.id,
      by: { column: 'receipt_no', value: receipt_no },
      logTag: 'cash-ledger-by-receipt',
    });
  },
  { auth: true },
);
