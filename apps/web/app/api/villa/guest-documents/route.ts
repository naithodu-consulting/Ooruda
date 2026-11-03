import { NextResponse } from 'next/server';

import { enhanceRouteHandler } from '@kit/next/routes';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { RecordIdSchema } from '~/home/[account]/bookings/_lib/schemas/guests.schema';
import {
  GuestIdError,
  createGuestsService,
} from '~/home/[account]/bookings/_lib/server/guests.service';
import { isVillaDbError } from '~/lib/villa-db/errors';
import { getVillaRole } from '~/lib/villa/auth';
import { guestIdUploadsEnabled } from '~/lib/villa/flags';
import { ID_FILE_MAX_BYTES } from '~/lib/villa/guest-ids';

/**
 * Uploads guest ID photos (multipart). The form carries:
 *   `data`    – JSON matching RecordIdSchema
 *   `file_0`  – first image/PDF (required)
 *   `file_N`  – further images/PDFs, up to 4, contiguous from 0
 *
 * `label_N` ('front' | 'back') is still accepted for rows created before the
 * labels were dropped from the form; the dialog no longer sends it.
 *
 * A route (not a server action): ID scans exceed the 1 MB action body limit.
 * Same schema and service as the no-file action.
 */
export const POST = enhanceRouteHandler(
  async function ({ request, user }) {
    // Refuse oversized bodies before reading them into memory.
    // Allow up to 10 × 10 MB files + headers overhead.
    const length = Number(request.headers.get('content-length') ?? 0);

    if (!length || length > 10 * ID_FILE_MAX_BYTES + 256 * 1024) {
      return NextResponse.json(
        { ok: false, message: 'The total upload is too large.' },
        { status: 413 },
      );
    }

    if (!guestIdUploadsEnabled()) {
      return NextResponse.json(
        {
          ok: false,
          message:
            'Storing ID files is not switched on yet. Record the ID as seen in person.',
        },
        { status: 403 },
      );
    }

    const form = await request.formData().catch(() => null);
    const raw = form?.get('data');

    let fields: unknown = null;

    try {
      fields = typeof raw === 'string' ? JSON.parse(raw) : null;
    } catch {
      fields = null;
    }

    const parsed = RecordIdSchema.safeParse(fields);

    if (!parsed.success || parsed.data.stage !== 'soft_copy') {
      return NextResponse.json(
        { ok: false, message: 'Check the ID details.' },
        { status: 400 },
      );
    }

    const role = await getVillaRole(parsed.data.accountId);

    if (role !== 'villa_admin' && role !== 'villa_manager') {
      return NextResponse.json(
        { ok: false, message: "You don't have permission to do this." },
        { status: 403 },
      );
    }

    try {
      const svc = createGuestsService(getSupabaseServerClient());
      const uploadedFiles = await svc.parseUploadedFiles(form!);
      const result = await svc.recordId(parsed.data, uploadedFiles, user.id);

      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      if (!isVillaDbError(error)) {
        (await getLogger()).warn(
          { error: error instanceof Error ? error.message : String(error) },
          'villa guest id upload refused',
        );
      }

      // Only messages written for the user; anything unexpected is generic.
      const message =
        error instanceof GuestIdError || isVillaDbError(error)
          ? error.message
          : 'Could not save the ID. Please try again.';

      return NextResponse.json({ ok: false, message }, { status: 422 });
    }
  },
  { auth: true },
);
