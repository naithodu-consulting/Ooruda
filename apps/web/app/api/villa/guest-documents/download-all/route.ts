import { NextResponse } from 'next/server';

import { zip } from 'fflate';

import { enhanceRouteHandler } from '@kit/next/routes';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  createGuestsService,
  extFromMime,
} from '~/home/[account]/bookings/_lib/server/guests.service';
import { getVillaRole } from '~/lib/villa/auth';
import { idDocTypeLabel } from '~/lib/villa/guest-ids';

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Downloads all live guest ID files for a booking as a zip.
 *   GET /api/villa/guest-documents/download-all?booking=<id>&account=<id>
 *
 * Files are fetched via signed URLs and packed in memory. The zip is streamed
 * back with Content-Disposition: attachment. Fails if the booking has no IDs.
 */
export const GET = enhanceRouteHandler(
  async function ({ request, user }) {
    const url = new URL(request.url);
    const accountId = url.searchParams.get('account') ?? '';
    const bookingId = url.searchParams.get('booking') ?? '';

    if (!UUID.test(accountId) || !UUID.test(bookingId)) {
      return new NextResponse('Not found', { status: 404 });
    }

    const role = await getVillaRole(accountId);

    if (role !== 'villa_admin' && role !== 'villa_manager') {
      return new NextResponse('Not found', { status: 404 });
    }

    const svc = createGuestsService(getSupabaseServerClient());
    const files = await svc.allFileUrls(accountId, bookingId, user.id);

    if (files.length === 0) {
      return NextResponse.json(
        { ok: false, message: 'No ID files on this booking.' },
        { status: 404 },
      );
    }

    // Fetch all files in parallel (signed URLs are already generated).
    const fetched = await Promise.all(
      files.map(async (f) => {
        const res = await fetch(f.signedUrl);
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();

        const ext = extFromMime(f.contentType);
        const labelPart = f.label
          ? `-${f.label}`
          : f.fileOrder > 1
            ? `-${f.fileOrder}`
            : '';
        const docLabel = idDocTypeLabel(f.docType)
          .toLowerCase()
          .replace(/\s+/g, '-');
        const name = `${docLabel}${labelPart}.${ext}`;

        return { name, bytes: new Uint8Array(buf) };
      }),
    );

    const entries = fetched.filter(Boolean) as {
      name: string;
      bytes: Uint8Array;
    }[];

    if (entries.length === 0) {
      return NextResponse.json(
        { ok: false, message: 'Could not fetch the ID files.' },
        { status: 502 },
      );
    }

    // De-duplicate names (two files of the same type would collide).
    const names = new Map<string, number>();
    const fileMap: Record<string, Uint8Array> = {};

    for (const entry of entries) {
      const count = (names.get(entry.name) ?? 0) + 1;
      names.set(entry.name, count);
      const uniqueName =
        count === 1
          ? entry.name
          : entry.name.replace(/(\.[^.]+)$/, `-${count}$1`);
      fileMap[uniqueName] = entry.bytes;
    }

    const zipBytes = await new Promise<Uint8Array>((resolve, reject) => {
      zip(fileMap, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    return new NextResponse(Buffer.from(zipBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="guest-ids-${bookingId.slice(0, 8)}.zip"`,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  },
  { auth: true },
);
