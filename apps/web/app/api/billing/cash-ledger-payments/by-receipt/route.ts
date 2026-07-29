import { NextResponse } from 'next/server';

import * as z from 'zod';

import { enhanceRouteHandler } from '@kit/next/routes';
import { billTypeLabel, renderReceiptPdf } from '@kit/pdf-templates';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

// ?receipt_no=PRM%2F26-27%2FMNT%2F000001
// Using query params avoids path-segment slash-encoding complexity.
const querySchema = z.object({
  receipt_no: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9/_-]+$/, 'Invalid receipt number'),
});

export const GET = enhanceRouteHandler(
  async function ({ request }) {
    const url = new URL(request.url);
    const { receipt_no } = querySchema.parse(
      Object.fromEntries(url.searchParams),
    );

    // cash_ledger_payments has REVOKE ALL FROM service_role — must use authenticated client.
    const client = getSupabaseServerClient();

    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: payment, error: queryError } = await client
      .from('cash_ledger_payments')
      .select(
        `id, association_id, unit_id, bill_type, amount, mode, reference_no,
         paid_at, receipt_no,
         units(unit_no, door_no, floor, owner_id),
         associations(account_id, address, gstin, pan_number,
                      registration_number, email, phone,
                      bank_account_name, bank_account_number,
                      bank_name, bank_ifsc, bank_branch,
                      accounts(name, picture_url))`,
      )
      .eq('receipt_no', receipt_no)
      .maybeSingle();

    if (queryError) {
      console.error('[cash-ledger-by-receipt] query error', queryError);
      return NextResponse.json(
        { error: 'Failed to load payment.' },
        { status: 500 },
      );
    }
    if (!payment) {
      return NextResponse.json(
        { error: 'Payment not found.' },
        { status: 404 },
      );
    }

    type AssocData = {
      account_id: string;
      address: string | null;
      gstin: string | null;
      pan_number: string | null;
      registration_number: string | null;
      email: string | null;
      phone: string | null;
      bank_account_name: string | null;
      bank_account_number: string | null;
      bank_name: string | null;
      bank_ifsc: string | null;
      bank_branch: string | null;
      accounts: { name: string; picture_url: string | null } | null;
    };
    type UnitData = {
      unit_no: string;
      door_no: string | null;
      floor: number | null;
      owner_id: string | null;
    };

    const unitData = payment.units as unknown as UnitData | null;
    const assoc = payment.associations as unknown as AssocData | null;

    if (!unitData || !assoc || !assoc.accounts) {
      return NextResponse.json(
        { error: 'Could not load unit/association data.' },
        { status: 500 },
      );
    }

    const { data: membership } = await client
      .from('accounts_memberships')
      .select('account_role')
      .eq('user_id', user.id)
      .eq('account_id', assoc.account_id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const isAdmin =
      membership.account_role === 'assoc_admin' ||
      membership.account_role === 'billing_operator';

    if (!isAdmin) {
      const isOwner = unitData.owner_id === user.id;
      if (!isOwner) {
        const { data: tenancy } = await client
          .from('tenancies')
          .select('id')
          .eq('tenant_id', user.id)
          .eq('unit_id', payment.unit_id)
          .eq('status', 'active')
          .maybeSingle();
        if (!tenancy) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
      }
    }

    const paidAt = new Date(payment.paid_at);
    const period = `${paidAt.getFullYear()}-${String(paidAt.getMonth() + 1).padStart(2, '0')}`;

    let bytes: Buffer;
    try {
      bytes = await renderReceiptPdf({
        association: {
          name: assoc.accounts.name,
          address: assoc.address,
          gstin: assoc.gstin,
          panNumber: assoc.pan_number ?? null,
          registrationNumber: assoc.registration_number ?? null,
          logoUrl: assoc.accounts.picture_url ?? null,
          email: assoc.email ?? null,
          phone: assoc.phone ?? null,
          bankAccountName: assoc.bank_account_name ?? null,
          bankAccountNumber: assoc.bank_account_number ?? null,
          bankName: assoc.bank_name ?? null,
          bankIfsc: assoc.bank_ifsc ?? null,
          bankBranch: assoc.bank_branch ?? null,
        },
        unit: {
          unitNo: unitData.unit_no,
          doorNo: unitData.door_no ?? null,
          floor: unitData.floor ?? null,
        },
        bill: { billNo: receipt_no, period },
        receipt: {
          receiptNo: receipt_no,
          generatedAt: new Date().toISOString(),
        },
        payment: {
          amount: payment.amount,
          mode: payment.mode,
          paidAt: payment.paid_at,
          referenceNo: payment.reference_no ?? null,
        },
        paymentContext: {
          type: 'due_payment',
          billTypeLabel: billTypeLabel(payment.bill_type as string | null),
        },
      });
    } catch (err) {
      console.error('[cash-ledger-by-receipt] render error', err);
      return NextResponse.json(
        { error: 'Could not generate receipt PDF.' },
        { status: 500 },
      );
    }

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${receipt_no}.pdf"`,
      },
    });
  },
  { auth: true },
);
