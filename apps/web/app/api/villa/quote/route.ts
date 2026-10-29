import { NextResponse } from 'next/server';

import { enhanceRouteHandler } from '@kit/next/routes';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { StaySchema } from '~/home/[account]/bookings/_lib/schemas/bookings.schema';
import { createBookingsService } from '~/home/[account]/bookings/_lib/server/bookings.service';
import { isVillaDbError } from '~/lib/villa-db/errors';
import { getVillaRole } from '~/lib/villa/auth';

/**
 * Live quote + availability for the new-booking form. A read, so a route
 * handler rather than a server action. It reuses the bookings route's schema
 * and service, so the preview and the booking itself can never price
 * differently; the booking is priced again on the server when it is created.
 */
export const POST = enhanceRouteHandler(
  async function ({ request }) {
    const parsed = StaySchema.safeParse(await request.json().catch(() => null));

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          reason: 'INVALID_INPUT',
          message: 'Check the dates and guests.',
        },
        { status: 400 },
      );
    }

    const role = await getVillaRole(parsed.data.accountId);

    if (!role) {
      return NextResponse.json(
        {
          ok: false,
          reason: 'FORBIDDEN',
          message: "You don't have access to this villa.",
        },
        { status: 403 },
      );
    }

    try {
      const quote = await createBookingsService(
        getSupabaseServerClient(),
      ).quote(parsed.data, role);

      return NextResponse.json(quote);
    } catch (error) {
      if (isVillaDbError(error)) {
        return NextResponse.json(
          { ok: false, reason: error.code, message: error.message },
          // The booking site failed: a gateway error, distinct in the logs.
          { status: 502 },
        );
      }

      (await getLogger()).error({ error }, 'villa quote failed');

      return NextResponse.json(
        {
          ok: false,
          reason: 'UNKNOWN',
          message: 'Could not get a quote. Try again.',
        },
        { status: 500 },
      );
    }
  },
  { auth: true },
);
