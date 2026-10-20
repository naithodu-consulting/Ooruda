import { NextResponse } from 'next/server';

import * as z from 'zod';

import { enhanceRouteHandler } from '@kit/next/routes';
import type { ExpenseExportRow } from '@kit/pdf-templates';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { preprocessLogoForPdf } from '~/home/[account]/billing/_lib/server/pdf-generation';
import { loadPdfRenderer } from '~/lib/server/pdf-renderer';

const BodySchema = z.object({
  associationId: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  mode: z.string().optional(),
  search: z.string().optional(),
  filterLabel: z.string().optional(),
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

    // Start loading/warming the renderer now; it overlaps the queries below.
    const rendererPromise = loadPdfRenderer();
    rendererPromise.catch(() => undefined);

    // Build query - RLS enforces association scoping automatically.
    let query = client
      .from('expenses')
      .select(
        'date_of_payment, title, amount, gst_amount, payee_name, mode_of_payment, reference_number, expense_categories(name)',
      )
      .eq('association_id', body.associationId)
      .is('deleted_at', null)
      .order('date_of_payment', { ascending: false });

    if (body.from) query = query.gte('date_of_payment', body.from);
    if (body.to) query = query.lte('date_of_payment', body.to);
    if (body.categoryId) query = query.eq('category_id', body.categoryId);
    if (body.mode) query = query.eq('mode_of_payment', body.mode);

    // The expenses and the association branding are independent - one stage.
    const [{ data: rows, error }, { data: assoc }] = await Promise.all([
      query,
      admin
        .from('associations')
        .select('address, gstin, email, phone, accounts(name, picture_url)')
        .eq('id', body.associationId)
        .single(),
    ]);

    if (error) {
      logger.error({ error }, 'expenses: export PDF fetch failed');
      return NextResponse.json(
        { error: 'Failed to fetch expenses.' },
        { status: 500 },
      );
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: 'No expenses found.' },
        { status: 404 },
      );
    }

    // Apply search filter (DB ilike would require dynamic query building; JS filter is fine for export volumes)
    const search = body.search?.toLowerCase();
    const filtered = search
      ? rows.filter(
          (e) =>
            e.title.toLowerCase().includes(search) ||
            e.payee_name.toLowerCase().includes(search) ||
            (e.reference_number ?? '').toLowerCase().includes(search),
        )
      : rows;

    if (filtered.length === 0) {
      return NextResponse.json(
        { error: 'No expenses match the current filters.' },
        { status: 404 },
      );
    }

    type Assoc = typeof assoc & {
      accounts: { name: string; picture_url: string | null } | null;
    };
    const assocData = assoc as unknown as Assoc;
    // The resized, process-cached logo rather than the full-size original,
    // which react-pdf would otherwise download and decode on every export.
    const logoPromise = preprocessLogoForPdf(
      assocData?.accounts?.picture_url ?? null,
    );

    const expenses: ExpenseExportRow[] = filtered.map((e) => ({
      date_of_payment: e.date_of_payment,
      title: e.title,
      category_name:
        (e.expense_categories as unknown as { name: string } | null)?.name ??
        null,
      payee_name: e.payee_name,
      mode_of_payment: e.mode_of_payment,
      amount: Number(e.amount),
      gst_amount: e.gst_amount != null ? Number(e.gst_amount) : null,
      reference_number: e.reference_number ?? null,
    }));

    const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);
    const totalGst = expenses.reduce((s, e) => s + (e.gst_amount ?? 0), 0);

    const generatedAt = new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    try {
      const [{ renderExpensesExportPdf }, logoUrl] = await Promise.all([
        rendererPromise,
        logoPromise,
      ]);
      const pdfBytes = await renderExpensesExportPdf({
        association: {
          name: assocData?.accounts?.name ?? 'Association',
          address: assocData?.address ?? null,
          gstin: assocData?.gstin ?? null,
          panNumber: null,
          registrationNumber: null,
          logoUrl,
          email: assocData?.email ?? null,
          phone: assocData?.phone ?? null,
        },
        filterLabel:
          body.filterLabel ??
          `${expenses.length} expense${expenses.length !== 1 ? 's' : ''}`,
        generatedAt,
        expenses,
        totalAmount,
        totalGst,
      });

      return new NextResponse(new Uint8Array(pdfBytes), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="expenses-${new Date().toISOString().slice(0, 10)}.pdf"`,
          'Cache-Control': 'private, no-store',
        },
      });
    } catch (err) {
      logger.error({ error: err }, 'expenses: PDF render failed');
      return NextResponse.json(
        { error: 'PDF generation failed.' },
        { status: 500 },
      );
    }
  },
  { auth: true },
);
