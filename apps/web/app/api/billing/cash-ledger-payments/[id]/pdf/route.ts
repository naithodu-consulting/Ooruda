import { NextResponse } from 'next/server';

import * as z from 'zod';

import { enhanceRouteHandler } from '@kit/next/routes';
import { billTypeLabel, renderReceiptPdf } from '@kit/pdf-templates';
import type { BillingEntityData } from '@kit/pdf-templates';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { preprocessLogoForPdf } from '~/home/[account]/billing/_lib/server/pdf-generation';
import { resolveOwnerEntity } from '~/lib/server/billing-entity';

export const runtime = 'nodejs';

export const GET = enhanceRouteHandler(
  async function ({ params, user }) {
    const { id } = z.object({ id: z.string().uuid() }).parse(params);

    // Use the regular (authenticated) client — cash_ledger_payments has
    // REVOKE ALL FROM service_role, so the admin client cannot query it.
    // The authenticated role has SELECT granted, and the clp_read RLS policy
    // allows any association member to read, so this is safe.
    // user is injected by enhanceRouteHandler (auth: true) — no extra getUser() call.
    const client = getSupabaseServerClient();

    const { data: payment, error: queryError } = await client
      .from('cash_ledger_payments')
      .select(
        `id, association_id, unit_id, bill_type, amount, mode, reference_no,
         paid_at, receipt_no, paid_by_role, tenancy_id, razorpay_payment_id,
         units(unit_no, door_no, floor, owner_id, owner_is_company,
               owner_company_name, owner_company_address, owner_company_gstin),
         associations(account_id, address, gstin, pan_number,
                      registration_number, email, phone,
                      bank_account_name, bank_account_number,
                      bank_name, bank_ifsc, bank_branch,
                      accounts(name, picture_url))`,
      )
      .eq('id', id)
      .maybeSingle();

    if (queryError) {
      const logger = await getLogger();
      logger.error(
        { id, error: queryError.message },
        '[cash-ledger-pdf] query error',
      );
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
      owner_is_company: boolean;
      owner_company_name: string | null;
      owner_company_address: string | null;
      owner_company_gstin: string | null;
    };

    const unitData = payment.units as unknown as UnitData | null;
    const assoc = payment.associations as unknown as AssocData | null;

    if (!unitData || !assoc || !assoc.accounts) {
      return NextResponse.json(
        { error: 'Could not load unit/association data.' },
        { status: 500 },
      );
    }

    // Authorization: RLS already ensures the user is an association member.
    // Additionally, for non-admin roles, verify they own or rent the unit.
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

    const receiptNo =
      payment.receipt_no ?? `CL-${payment.id.slice(0, 8).toUpperCase()}`;

    // Derive YYYY-MM period from the payment date for the receipt template.
    const paidAt = new Date(payment.paid_at);
    const period = `${paidAt.getFullYear()}-${String(paidAt.getMonth() + 1).padStart(2, '0')}`;

    // Resolve "Received From" using the tenancy snapshot stored at payment time.
    // tenancy_id was captured by the RPC at the moment of recording, so it
    // survives tenant turnover and always refers to the correct historical tenant.
    const paidByRole =
      (payment as unknown as { paid_by_role: string | null }).paid_by_role ??
      'Owner';
    const storedTenancyId = (
      payment as unknown as { tenancy_id: string | null }
    ).tenancy_id;
    const adminClient = getSupabaseServerAdminClient();

    let receivedFrom: BillingEntityData;
    if (paidByRole === 'Tenant' && storedTenancyId) {
      const { data: tenancy } = await adminClient
        .from('tenancies')
        .select(
          'tenant_id, is_company, company_name, company_address, company_gstin',
        )
        .eq('id', storedTenancyId)
        .maybeSingle();

      if (tenancy) {
        if ((tenancy as unknown as { is_company: boolean }).is_company) {
          receivedFrom = {
            isCompany: true,
            name: (tenancy as unknown as { company_name: string | null })
              .company_name,
            companyAddress: (
              tenancy as unknown as { company_address: string | null }
            ).company_address,
            companyGstin: (
              tenancy as unknown as { company_gstin: string | null }
            ).company_gstin,
          };
        } else {
          const { data: profile } = await adminClient
            .from('profiles')
            .select('full_name')
            .eq('id', (tenancy as unknown as { tenant_id: string }).tenant_id)
            .maybeSingle();
          receivedFrom = {
            isCompany: false,
            name:
              (profile as { full_name: string | null } | null)?.full_name ??
              null,
            companyAddress: null,
            companyGstin: null,
          };
        }
      } else {
        receivedFrom = await resolveOwnerEntity(unitData, adminClient);
      }
    } else {
      receivedFrom = await resolveOwnerEntity(unitData, adminClient);
    }

    const logoUrl = await preprocessLogoForPdf(assoc.accounts.picture_url);

    let bytes: Buffer;
    try {
      bytes = await renderReceiptPdf({
        association: {
          name: assoc.accounts.name,
          address: assoc.address,
          gstin: assoc.gstin,
          panNumber: assoc.pan_number ?? null,
          registrationNumber: assoc.registration_number ?? null,
          logoUrl,
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
        billTo: receivedFrom,
        bill: { billNo: receiptNo, period },
        receipt: {
          receiptNo,
          generatedAt: new Date().toISOString(),
        },
        payment: {
          amount: payment.amount,
          mode: payment.mode,
          paidAt: payment.paid_at,
          referenceNo:
            payment.reference_no ??
            (payment.mode === 'Razorpay'
              ? ((payment as unknown as { razorpay_payment_id: string | null })
                  .razorpay_payment_id ?? null)
              : null),
        },
        paymentContext: {
          type: 'due_payment',
          billTypeLabel: billTypeLabel(payment.bill_type as string | null),
        },
      });
    } catch (err) {
      const logger = await getLogger();
      logger.error({ id, error: err }, '[cash-ledger-pdf] render error');
      return NextResponse.json(
        { error: 'Could not generate receipt PDF.' },
        { status: 500 },
      );
    }

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${receiptNo}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  },
  { auth: true },
);
