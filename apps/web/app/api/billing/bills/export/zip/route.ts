import { NextResponse } from 'next/server';

import { zip } from 'fflate';
import * as z from 'zod';

import { enhanceRouteHandler } from '@kit/next/routes';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { getOrGenerateBillPdf } from '~/home/[account]/billing/_lib/server/pdf-generation';
import { billTypeLabel } from '~/home/[account]/billing/_lib/unit-billing-types';
import { requireRole } from '~/lib/rbac';

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
      units: { unit_no: string } | null;
    };

    const { data: bills, error } = await client
      .from('bills')
      .select('id, unit_id, period, bill_no, bill_type, units(unit_no)')
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

    // Batch PDF generation in groups of 5
    const BATCH_SIZE = 5;
    const files: Record<string, Uint8Array> = {};

    for (let i = 0; i < billList.length; i += BATCH_SIZE) {
      const batch = billList.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (bill) => {
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

          const unitNo = bill.units?.unit_no ?? bill.unit_id;
          const typeLabel = billTypeLabel(
            bill.bill_type ?? 'maintenance',
          ).replace(/\s+/g, '-');
          const billNoSafe = bill.bill_no.replace(/\//g, '-');
          const path = `unit-${unitNo}/${bill.period}-${typeLabel}-${billNoSafe}.pdf`;
          files[path] = bytes;
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
