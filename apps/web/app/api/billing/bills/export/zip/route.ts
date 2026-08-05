import { NextResponse } from 'next/server';

import { zip } from 'fflate';
import * as z from 'zod';

import { enhanceRouteHandler } from '@kit/next/routes';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { getOrGenerateBillPdf } from '~/home/[account]/billing/_lib/server/pdf-generation';
import { billTypeLabel } from '~/home/[account]/billing/_lib/unit-billing-types';
import { requireRole } from '~/lib/rbac';

const BUCKET = 'billing-documents';

const BodySchema = z.object({
  unitIds: z.array(z.string().uuid()).min(1).max(100),
  accountSlug: z.string(),
});

export const POST = enhanceRouteHandler(
  async function ({ request }) {
    const body = BodySchema.parse(await request.json());
    const { unitIds, accountSlug } = body;

    const { accountId } = await requireRole(accountSlug, [
      'assoc_admin',
      'billing_operator',
    ]);

    const client = getSupabaseServerClient();
    const admin = getSupabaseServerAdminClient();

    const { data: association } = await client
      .from('associations')
      .select('id')
      .eq('account_id', accountId)
      .single();

    if (!association) {
      return NextResponse.json(
        { error: 'Association not found.' },
        { status: 404 },
      );
    }

    type BillRow = {
      id: string;
      unit_id: string;
      period: string;
      bill_no: string;
      bill_type: string | null;
      pdf_url: string | null;
      units: { unit_no: string } | null;
    };

    // Include pdf_url so we can batch-sign cached PDFs without a per-bill DB call.
    const { data: bills, error } = await client
      .from('bills')
      .select('id, unit_id, period, bill_no, bill_type, pdf_url, units(unit_no)')
      .eq('association_id', association.id)
      .in('unit_id', unitIds)
      .neq('status', 'Void')
      .order('period', { ascending: false })
      .order('bill_no');

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch bills.' },
        { status: 500 },
      );
    }

    const billList = (bills ?? []) as unknown as BillRow[];

    function buildPath(bill: BillRow): string {
      const unitNo = bill.units?.unit_no ?? bill.unit_id;
      const typeLabel = billTypeLabel(bill.bill_type ?? 'maintenance').replace(
        /\s+/g,
        '-',
      );
      const billNoSafe = bill.bill_no.replace(/\//g, '-');
      return `unit-${unitNo}/${bill.period}-${typeLabel}-${billNoSafe}.pdf`;
    }

    const files: Record<string, Uint8Array> = {};

    // Split on whether the bill already has a cached PDF in Storage.
    const withPdf = billList.filter((b) => b.pdf_url);
    // Mutable: fallback bills from signed-URL failures are appended here.
    const needsGeneration = billList.filter((b) => !b.pdf_url);

    // Batch-sign all cached PDF storage paths in ONE Storage API call,
    // replacing what was previously N individual createSignedUrl calls.
    if (withPdf.length > 0) {
      const { data: signed } = await admin.storage
        .from(BUCKET)
        .createSignedUrls(
          withPdf.map((b) => b.pdf_url!),
          300,
        );

      const urlByPath = new Map(
        (signed ?? [])
          .filter((s) => s.signedUrl)
          .map((s) => [s.path, s.signedUrl!]),
      );

      // Fetch all cached PDFs in parallel — pure HTTP fetches, zero DB calls.
      await Promise.all(
        withPdf.map(async (bill) => {
          const url = urlByPath.get(bill.pdf_url!);
          if (!url) {
            // Signed URL creation failed (file missing from Storage) —
            // fall back to full generation so the ZIP still contains this bill.
            needsGeneration.push(bill);
            return;
          }
          const res = await fetch(url);
          if (!res.ok) {
            needsGeneration.push(bill);
            return;
          }
          files[buildPath(bill)] = new Uint8Array(await res.arrayBuffer());
        }),
      );
    }

    // Generate PDFs for cache misses (first-time generation or Storage gap),
    // batched 5 at a time so we don't overwhelm the render pool.
    const BATCH_SIZE = 5;
    for (let i = 0; i < needsGeneration.length; i += BATCH_SIZE) {
      await Promise.all(
        needsGeneration.slice(i, i + BATCH_SIZE).map(async (bill) => {
          const result = await getOrGenerateBillPdf(bill.id, {
            skipAuth: true,
          });
          if (!result) return;

          let bytes: Uint8Array;
          if (result.bytes) {
            bytes = new Uint8Array(result.bytes);
          } else if (result.signedUrl) {
            const res = await fetch(result.signedUrl);
            bytes = new Uint8Array(await res.arrayBuffer());
          } else {
            return;
          }
          files[buildPath(bill)] = bytes;
        }),
      );
    }

    const zipped = await new Promise<Uint8Array>((resolve, reject) => {
      zip(files, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const date = new Date().toISOString().slice(0, 10);

    return new NextResponse(zipped as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="bills-${unitIds.length}units-${date}.zip"`,
      },
    });
  },
  { auth: true },
);
