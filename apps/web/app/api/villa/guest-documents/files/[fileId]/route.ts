import { NextResponse } from 'next/server';

import { enhanceRouteHandler } from '@kit/next/routes';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { createGuestsService } from '~/home/[account]/bookings/_lib/server/guests.service';
import { getVillaRole } from '~/lib/villa/auth';

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Opens or downloads a single guest ID file.
 *   GET /api/villa/guest-documents/files/[fileId]?account=<id>
 *   GET /api/villa/guest-documents/files/[fileId]?account=<id>&download=1
 *
 * Checks the villa role, records the access, then redirects to a 60-second
 * signed link. With `?download=1` the link carries Content-Disposition:
 * attachment so the browser saves rather than previewing.
 */
export const GET = enhanceRouteHandler(
  async function ({ request, user, params }) {
    const fileId = String(params?.fileId ?? '');
    const url = new URL(request.url);
    const accountId = url.searchParams.get('account') ?? '';
    const download = url.searchParams.get('download') === '1';

    if (!UUID.test(fileId) || !UUID.test(accountId)) {
      return new NextResponse('Not found', { status: 404 });
    }

    const role = await getVillaRole(accountId);

    if (role !== 'villa_admin' && role !== 'villa_manager') {
      return new NextResponse('Not found', { status: 404 });
    }

    try {
      const signedUrl = await createGuestsService(
        getSupabaseServerClient(),
      ).fileUrl(accountId, fileId, user.id, download);

      const response = NextResponse.redirect(signedUrl, 302);
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('Referrer-Policy', 'no-referrer');
      return response;
    } catch {
      return new NextResponse('Not found', { status: 404 });
    }
  },
  { auth: true },
);
