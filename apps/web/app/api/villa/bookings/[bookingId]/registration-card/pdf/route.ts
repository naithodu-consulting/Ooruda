import { NextResponse } from 'next/server';

import * as z from 'zod';

import { enhanceRouteHandler } from '@kit/next/routes';
import { hasRegistrationCardTemplate } from '@kit/pdf-templates/registration-card-templates';
import { getLogger } from '@kit/shared/logger';

import { loadRegistrationCardData } from '~/home/[account]/bookings/[bookingId]/_lib/server/registration-card-data';
import { loadPdfRenderer } from '~/lib/server/pdf-renderer';
import { isVillaDbError } from '~/lib/villa-db/errors';
import { getVillaRole } from '~/lib/villa/auth';

/**
 * The guest registration card for one booking, as a PDF to print and hand
 * over at check-in.
 *
 * GET /api/villa/bookings/[bookingId]/registration-card/pdf?account=<id>&property=<id>
 *
 * A route rather than a server action because the response is a file: the
 * button fetches it and saves the blob, so nothing is base64'd through React.
 *
 * Never cached, anywhere: the card carries the guest's name, e-mail and
 * mobile, and it changes as the booking does.
 */

// Real UUIDs, not "any 36 hex-and-hyphen characters": a loose guard let
// nonsense through to Postgres, which answered 22P02 and turned a 404 into a
// 500 plus an error log line per request.
const Params = z.object({
  bookingId: z.string().uuid(),
  accountId: z.string().uuid(),
  propertyId: z.string().uuid(),
});

export const GET = enhanceRouteHandler(
  async function ({ request, params }) {
    const url = new URL(request.url);

    const parsed = Params.safeParse({
      bookingId: params?.bookingId,
      accountId: url.searchParams.get('account'),
      propertyId: url.searchParams.get('property'),
    });

    if (!parsed.success) return notFound();

    const { bookingId, accountId, propertyId } = parsed.data;

    // Defence in depth on top of RLS, as every villa route does. Checked
    // before the renderer is loaded so a caller with no business here never
    // pays for it.
    const role = await getVillaRole(accountId);

    if (role !== 'villa_admin' && role !== 'villa_manager') {
      return notFound();
    }

    // Loads and warms the renderer while the queries are in flight. The catch
    // only parks the rejection so Node does not kill the process before the
    // await below re-throws it into this handler's own catch.
    const rendererPromise = loadPdfRenderer();
    rendererPromise.catch(() => undefined);

    try {
      const card = await loadRegistrationCardData({
        accountId,
        propertyId,
        bookingId,
      });

      // No booking, a stay that is not happening, or a villa with no card of
      // its own: there is deliberately no generic template to fall back to.
      if (!card || !hasRegistrationCardTemplate(card.template)) {
        return notFound();
      }

      const renderer = await rendererPromise;
      const pdf = await renderer.renderRegistrationCardPdf(
        card.template,
        card.data,
      );

      // A record of who printed a document carrying the guest's name, mobile,
      // e-mail and ID type. The card itself is never stored.
      (await getLogger()).info(
        { accountId, propertyId, bookingId, template: card.template },
        'villa registration card printed',
      );

      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename(card.bookingId)}"`,
          'Cache-Control': 'private, no-store',
          'Referrer-Policy': 'no-referrer',
        },
      });
    } catch (error) {
      // A villa that is switched off, not linked, or whose booking site has
      // no such property is "no card here", not a server fault - and must not
      // be logged as one. UNREACHABLE and the rest still are.
      if (
        isVillaDbError(error) &&
        ['NOT_FOUND', 'INACTIVE', 'NOT_CONFIGURED'].includes(error.code)
      ) {
        return notFound();
      }

      (await getLogger()).error(
        { accountId, propertyId, bookingId, error },
        'villa registration card pdf failed',
      );

      return NextResponse.json(
        { error: 'Could not generate the registration card.' },
        { status: 500 },
      );
    }
  },
  { auth: true },
);

function notFound() {
  return NextResponse.json(
    { error: 'This booking has no registration card.' },
    { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
  );
}

/** "registration-card-V19-2611-0007.pdf", with nothing a header dislikes. */
function filename(bookingCode: string) {
  const stem = bookingCode.replace(/[^\w.-]+/g, '-').slice(0, 60);

  return `registration-card-${stem || 'booking'}.pdf`;
}
