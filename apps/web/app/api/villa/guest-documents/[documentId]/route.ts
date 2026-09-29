import { NextResponse } from 'next/server';

import { enhanceRouteHandler } from '@kit/next/routes';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { createGuestsService } from '~/home/[account]/bookings/_lib/server/guests.service';
import { getVillaRole } from '~/lib/villa/auth';

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Opens a guest ID file: checks the villa role, records the view, then
 * redirects to a 60-second signed link. `?account=<account id>`.
 */
export const GET = enhanceRouteHandler(
  async function ({ request, user, params }) {
    const documentId = String(params?.documentId ?? '');
    const accountId = new URL(request.url).searchParams.get('account') ?? '';

    if (!UUID.test(documentId) || !UUID.test(accountId)) {
      return new NextResponse('Not found', { status: 404 });
    }

    const role = await getVillaRole(accountId);

    if (role !== 'villa_owner' && role !== 'villa_manager') {
      return new NextResponse('Not found', { status: 404 });
    }

    try {
      const url = await createGuestsService(getSupabaseServerClient()).viewUrl(
        accountId,
        documentId,
        user.id,
      );

      const response = NextResponse.redirect(url, 302);
      // Never cache the redirect to a signed link.
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('Referrer-Policy', 'no-referrer');
      return response;
    } catch {
      return new NextResponse('Not found', { status: 404 });
    }
  },
  { auth: true },
);
