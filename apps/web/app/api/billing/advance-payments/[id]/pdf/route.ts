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

    const client = getSupabaseServerClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: entry, error: queryError } = await (client as any)
      .from('cash_ledger')
      .select(
        `id, association_id, unit_id, bill_type, amount, entry_date,
         paid_by_name, paid_by_role, tenancy_id, razorpay_payment_id,
         units(unit_no, door_no, floor, owner_id, owner_is_company,
               owner_company_name, owner_company_address, owner_company_gstin),
         associations(account_id, address, gstin, pan_number,
                      registration_number, email, phone,
                      bank_account_name, bank_account_number,
                      bank_name, bank_ifsc, bank_branch,
                      accounts(name, picture_url))`,
      )
      .eq('id', id)
      .eq('entry_type', 'advance_payment')
      .maybeSingle();

    if (queryError) {
      const logger = await getLogger();
      logger.error(
        { id, error: queryError.message },
        '[advance-pdf] query error',
      );
      return NextResponse.json(
        { error: 'Failed to load advance entry.' },
        { status: 500 },
      );
    }
    if (!entry) {
      return NextResponse.json(
        { error: 'Advance payment not found.' },
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

    const unitData = entry.units as unknown as UnitData | null;
    const assoc = entry.associations as unknown as AssocData | null;

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
          .eq('unit_id', entry.unit_id)
          .eq('status', 'active')
          .maybeSingle();

        if (!tenancy) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
      }
    }

    const receiptNo = `ADV-${id.slice(0, 8).toUpperCase()}`;

    const entryDate = new Date(entry.entry_date + 'T00:00:00');
    const period = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')}`;

    const paidByRole = (entry.paid_by_role as string | null) ?? 'Owner';
    const storedTenancyId = entry.tenancy_id as string | null;
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
          amount: Number(entry.amount),
          mode: (entry.razorpay_payment_id as string | null)
            ? 'Razorpay'
            : 'Cash / Manual',
          paidAt: entry.entry_date + 'T00:00:00Z',
          referenceNo: (entry.razorpay_payment_id as string | null) ?? null,
        },
        paymentContext: {
          type: 'advance_deposit',
          billTypeLabel: billTypeLabel(entry.bill_type as string | null),
        },
      });
    } catch (err) {
      const logger = await getLogger();
      logger.error({ id, error: err }, '[advance-pdf] render error');
      return NextResponse.json(
        { error: 'Could not generate receipt PDF.' },
        { status: 500 },
      );
    }

    const unitNo = unitData.unit_no;
    const filename = `advance-deposit-unit${unitNo}-${receiptNo}.pdf`;

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  },
  { auth: true },
);
