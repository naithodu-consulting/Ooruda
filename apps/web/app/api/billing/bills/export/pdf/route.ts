import { NextResponse } from 'next/server';

import * as z from 'zod';

import { enhanceRouteHandler } from '@kit/next/routes';
import { renderBillsExportPdf, type BillsExportRow } from '@kit/pdf-templates';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { billOutstanding, displayBillStatus } from '~/lib/bill-status';
import { sanitizeLogoUrl } from '~/lib/server/sanitize-logo-url';

const MAX_IDS = 300;

const BodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(MAX_IDS),
});

export const POST = enhanceRouteHandler(
  async function ({ request }) {
    const logger = await getLogger();

    let body: z.infer<typeof BodySchema>;
    try {
      body = BodySchema.parse(await request.json());
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body.' },
        { status: 400 },
      );
    }

    const client = getSupabaseServerClient();
    const admin = getSupabaseServerAdminClient();

    // RLS: fetch only the bills the caller can see, scoped to their association.
    const { data: bills, error } = await client
      .from('bills')
      .select(
        'id, association_id, bill_no, period, bill_type, total_amount, paid_amount, advance_applied, gst_amount, status, due_date, units(unit_no)',
      )
      .in('id', body.ids);

    if (error) {
      logger.error({ error }, 'Bills export PDF: failed to fetch bills');
      return NextResponse.json(
        { error: 'Failed to fetch bills.' },
        { status: 500 },
      );
    }

    if (!bills || bills.length === 0) {
      return NextResponse.json(
        { error: 'No accessible bills found.' },
        { status: 404 },
      );
    }

    // All bills must belong to the same association (they always do via RLS,
    // but this guards against a crafted request mixing association IDs).
    const associationId = bills[0]!.association_id;
    if (bills.some((b) => b.association_id !== associationId)) {
      return NextResponse.json(
        { error: 'Mixed associations.' },
        { status: 400 },
      );
    }

    // Fetch association branding.
    const { data: assoc } = await admin
      .from('associations')
      .select(
        'address, gstin, pan_number, registration_number, email, phone, accounts(name, picture_url)',
      )
      .eq('id', associationId)
      .single();

    if (!assoc) {
      return NextResponse.json(
        { error: 'Association not found.' },
        { status: 404 },
      );
    }

    type ExtendedAssoc = typeof assoc & {
      pan_number: string | null;
      accounts: { name: string; picture_url: string | null } | null;
    };
    const assocData = assoc as unknown as ExtendedAssoc;
    const accountName = assocData.accounts?.name ?? 'Association';
    const rawLogoUrl = assocData.accounts?.picture_url ?? null;

    const exportRows: BillsExportRow[] = bills.map((b) => {
      const billData = {
        status: b.status,
        due_date: b.due_date,
        total_amount: Number(b.total_amount),
        paid_amount: Number(b.paid_amount),
        advance_applied:
          b.advance_applied != null ? Number(b.advance_applied) : 0,
      };
      return {
        bill_no: b.bill_no,
        period: b.period,
        unit_no:
          (b.units as unknown as { unit_no: string } | null)?.unit_no ?? '—',
        bill_type: b.bill_type ?? 'maintenance',
        total_amount: billData.total_amount,
        paid_amount: billData.paid_amount,
        outstanding: billOutstanding(billData),
        gst_amount: b.gst_amount != null ? Number(b.gst_amount) : null,
        status: displayBillStatus(billData),
        due_date: b.due_date,
      };
    });

    const totalBilled = exportRows.reduce((s, r) => s + r.total_amount, 0);
    const totalCollected = exportRows.reduce(
      (s, r) => s + r.total_amount - r.outstanding,
      0,
    );

    const generatedAt = new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    try {
      const pdfBytes = await renderBillsExportPdf({
        association: {
          name: accountName,
          address: assocData.address ?? null,
          gstin: assocData.gstin ?? null,
          panNumber: assocData.pan_number ?? null,
          registrationNumber: assocData.registration_number ?? null,
          logoUrl: sanitizeLogoUrl(rawLogoUrl),
          email: assocData.email ?? null,
          phone: assocData.phone ?? null,
        },
        filterLabel: `${exportRows.length} bill${exportRows.length !== 1 ? 's' : ''}`,
        generatedAt,
        bills: exportRows,
        totals: {
          totalBilled,
          totalCollected,
          totalOutstanding: Math.max(0, totalBilled - totalCollected),
        },
      });

      return new NextResponse(new Uint8Array(pdfBytes), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="bills-export-${new Date().toISOString().slice(0, 10)}.pdf"`,
          'Cache-Control': 'private, no-store',
        },
      });
    } catch (err) {
      logger.error({ error: err }, 'Bills export PDF: render failed');
      return NextResponse.json(
        { error: 'PDF generation failed.' },
        { status: 500 },
      );
    }
  },
  { auth: true },
);
