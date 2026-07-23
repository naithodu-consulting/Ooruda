import { NextResponse } from 'next/server';

import * as z from 'zod';

import { enhanceRouteHandler } from '@kit/next/routes';
import {
  renderPaymentsExportPdf,
  type PaymentsExportRow,
} from '@kit/pdf-templates';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { sanitizeLogoUrl } from '~/lib/server/sanitize-logo-url';

const MAX_IDS = 300;

function resolveStatus(
  status: string,
  dueDate: string,
  total: number,
  paid: number,
): string {
  if (total === 0 || paid >= total) return 'Paid';
  let effective =
    status === 'Paid' && paid < total
      ? paid > 0
        ? 'Partial'
        : 'Unpaid'
      : status;
  const today = new Date().toISOString().slice(0, 10);
  if (
    dueDate < today &&
    (effective === 'Unpaid' ||
      effective === 'Partial' ||
      effective === 'Overdue')
  ) {
    return 'Overdue';
  }
  return effective;
}

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

    // RLS: fetch only bills visible to this user, with nested payments.
    const { data: bills, error } = await client
      .from('bills')
      .select(
        `id, association_id, bill_no, period, bill_type, total_amount, paid_amount, advance_applied, status, due_date,
         units(unit_no),
         payments(id, amount, mode, reference_no, paid_at)`,
      )
      .in('id', body.ids);

    if (error) {
      logger.error({ error }, 'Payments export PDF: failed to fetch bills');
      return NextResponse.json(
        { error: 'Failed to fetch data.' },
        { status: 500 },
      );
    }

    if (!bills || bills.length === 0) {
      return NextResponse.json(
        { error: 'No accessible bills found.' },
        { status: 404 },
      );
    }

    const associationId = bills[0]!.association_id;
    if (bills.some((b) => b.association_id !== associationId)) {
      return NextResponse.json(
        { error: 'Mixed associations.' },
        { status: 400 },
      );
    }

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

    // Flatten: one row per payment (bills with no payments get one empty row).
    const exportRows: PaymentsExportRow[] = [];
    let paymentCount = 0;
    let totalBilled = 0;
    let totalCollected = 0;

    for (const b of bills) {
      const unitNo =
        (b.units as unknown as { unit_no: string } | null)?.unit_no ?? '—';
      const bStatus = resolveStatus(
        b.status,
        b.due_date,
        Number(b.total_amount),
        Number(b.paid_amount),
      );
      const payments = (b.payments ?? []) as {
        id: string;
        amount: number;
        mode: string;
        reference_no: string | null;
        paid_at: string;
      }[];

      totalBilled += Number(b.total_amount);
      totalCollected += Number(b.paid_amount);

      if (payments.length === 0) {
        exportRows.push({
          bill_no: b.bill_no,
          period: b.period,
          unit_no: unitNo,
          bill_type: b.bill_type ?? 'maintenance',
          total_amount: Number(b.total_amount),
          advance_applied: Number(b.advance_applied ?? 0),
          bill_status: bStatus,
          payment_date: null,
          payment_mode: null,
          amount_paid: null,
          reference_no: null,
        });
      } else {
        for (const p of payments) {
          paymentCount++;
          exportRows.push({
            bill_no: b.bill_no,
            period: b.period,
            unit_no: unitNo,
            bill_type: b.bill_type ?? 'maintenance',
            total_amount: Number(b.total_amount),
            advance_applied: Number(b.advance_applied ?? 0),
            bill_status: bStatus,
            payment_date: p.paid_at?.slice(0, 10) ?? null,
            payment_mode: p.mode,
            amount_paid: Number(p.amount),
            reference_no: p.reference_no ?? null,
          });
        }
      }
    }

    const generatedAt = new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    try {
      const pdfBytes = await renderPaymentsExportPdf({
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
        filterLabel: `${bills.length} bill${bills.length !== 1 ? 's' : ''} · ${paymentCount} payment${paymentCount !== 1 ? 's' : ''}`,
        generatedAt,
        rows: exportRows,
        totals: {
          totalBilled,
          totalCollected,
          totalOutstanding: Math.max(0, totalBilled - totalCollected),
          paymentCount,
        },
      });

      return new NextResponse(new Uint8Array(pdfBytes), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="payments-export-${new Date().toISOString().slice(0, 10)}.pdf"`,
        },
      });
    } catch (err) {
      logger.error({ error: err }, 'Payments export PDF: render failed');
      return NextResponse.json(
        { error: 'PDF generation failed.' },
        { status: 500 },
      );
    }
  },
  { auth: true },
);
