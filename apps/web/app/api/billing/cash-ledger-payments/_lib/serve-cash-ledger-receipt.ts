import 'server-only';
import { NextResponse } from 'next/server';

import { billTypeLabel } from '@kit/pdf-templates/bill-type-labels';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { preprocessLogoForPdf } from '~/home/[account]/billing/_lib/server/pdf-generation';
import { resolvePaidByEntity } from '~/lib/server/billing-entity';
import {
  cachePdfInBackground,
  contentCachePath,
  pdfAttachmentResponse,
  signCachedPdfPath,
} from '~/lib/server/pdf-cache';
import { loadPdfRenderer } from '~/lib/server/pdf-renderer';
import { canReadUnitDocument } from '~/lib/server/unit-document-access';

const PAYMENT_SELECT = `id, association_id, unit_id, bill_type, amount, mode, reference_no,
  paid_at, receipt_no, paid_by_role, tenancy_id, razorpay_payment_id,
  units(unit_no, door_no, floor, owner_id, owner_is_company,
        owner_company_name, owner_company_address, owner_company_gstin),
  associations(account_id, address, gstin, pan_number,
               registration_number, email, phone,
               bank_account_name, bank_account_number,
               bank_name, bank_ifsc, bank_branch,
               accounts(name, picture_url))`;

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

/**
 * Serves the receipt PDF for one cash-ledger payment, looked up by id or by
 * receipt number.
 *
 * One query loads the payment; then the access check, the Storage cache
 * lookup, the payer, the logo and the (warming) renderer all run in parallel.
 * A cache hit redirects to a signed URL; a miss renders, responds, and caches
 * the PDF after the response.
 */
export async function serveCashLedgerReceipt(params: {
  userId: string;
  by: { column: 'id' | 'receipt_no'; value: string };
  logTag: string;
}) {
  const { userId, by, logTag } = params;

  // cash_ledger_payments has REVOKE ALL FROM service_role, so it must be read
  // with the authenticated client. The clp_read RLS policy lets any
  // association member read it; unit-level access is checked below.
  const client = getSupabaseServerClient();

  const { data: payment, error: queryError } = await client
    .from('cash_ledger_payments')
    .select(PAYMENT_SELECT)
    .eq(by.column, by.value)
    .maybeSingle();

  if (queryError) {
    const logger = await getLogger();
    logger.error({ by, error: queryError.message }, `[${logTag}] query error`);
    return NextResponse.json(
      { error: 'Failed to load payment.' },
      { status: 500 },
    );
  }

  if (!payment) {
    return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });
  }

  const unitData = payment.units as unknown as UnitData | null;
  const assoc = payment.associations as unknown as AssocData | null;

  if (!unitData || !assoc || !assoc.accounts) {
    return NextResponse.json(
      { error: 'Could not load unit/association data.' },
      { status: 500 },
    );
  }

  const receiptNo =
    payment.receipt_no ?? `CL-${payment.id.slice(0, 8).toUpperCase()}`;
  const filename = `${receiptNo}.pdf`;
  const cachePath = contentCachePath(
    'cash-ledger-receipts',
    payment.association_id,
    payment.id,
    payment,
  );

  const paidByRole =
    (payment as unknown as { paid_by_role: string | null }).paid_by_role ??
    'Owner';
  const storedTenancyId = (payment as unknown as { tenancy_id: string | null })
    .tenancy_id;

  const rendererPromise = loadPdfRenderer();
  rendererPromise.catch(() => undefined);

  // Nothing is returned until the caller is confirmed to have access.
  const [authorized, cachedUrl, receivedFrom, logoUrl] = await Promise.all([
    canReadUnitDocument(client, {
      userId,
      accountId: assoc.account_id,
      unitId: payment.unit_id,
      ownerId: unitData.owner_id,
    }),
    signCachedPdfPath(cachePath, filename),
    resolvePaidByEntity(
      paidByRole,
      storedTenancyId,
      unitData,
      getSupabaseServerAdminClient(),
    ),
    preprocessLogoForPdf(assoc.accounts.picture_url),
  ]);

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  if (cachedUrl) {
    return NextResponse.redirect(cachedUrl);
  }

  // Derive YYYY-MM period from the payment date for the receipt template.
  const paidAt = new Date(payment.paid_at);
  const period = `${paidAt.getFullYear()}-${String(paidAt.getMonth() + 1).padStart(2, '0')}`;

  let bytes: Buffer;
  try {
    const { renderReceiptPdf } = await rendererPromise;
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
    logger.error({ by, error: err }, `[${logTag}] render error`);
    return NextResponse.json(
      { error: 'Could not generate receipt PDF.' },
      { status: 500 },
    );
  }

  cachePdfInBackground(cachePath, bytes);

  return pdfAttachmentResponse(bytes, filename);
}
