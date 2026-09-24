import * as z from 'zod';

import { enhanceRouteHandler } from '@kit/next/routes';

import { serveCashLedgerReceipt } from '../../_lib/serve-cash-ledger-receipt';

export const runtime = 'nodejs';

export const GET = enhanceRouteHandler(
  async function ({ params, user }) {
    const { id } = z.object({ id: z.string().uuid() }).parse(params);

    return serveCashLedgerReceipt({
      userId: user.id,
      by: { column: 'id', value: id },
      logTag: 'cash-ledger-pdf',
    });
  },
  { auth: true },
);
