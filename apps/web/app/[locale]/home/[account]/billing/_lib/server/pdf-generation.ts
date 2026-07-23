import 'server-only';
import type { BillingEntityData } from '@kit/pdf-templates';
import {
  renderBillPdf,
  renderElectricityBillPdf,
  renderReceiptPdf,
} from '@kit/pdf-templates';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { logAuditEvent } from '~/lib/audit-log';
import { getAssociationRole } from '~/lib/rbac';
import { sanitizeLogoUrl } from '~/lib/server/sanitize-logo-url';
import { getActiveTenancyId } from '~/lib/unit-access';

const BUCKET = 'billing-documents';

const pendingPdfGenerations = new Map<string, Promise<GeneratedPdf | null>>();

export interface GeneratedPdf {
  /** Raw bytes — set when the PDF was just rendered (cache miss). */
  bytes?: Buffer;
  /** Signed Storage URL — set when the PDF was already cached (cache hit). Redirect the browser here directly to avoid proxying through Next.js. */
  signedUrl?: string;
  filename: string;
}

/**
 * The `bills`/`payments` RLS policy only checks association membership
 * (`is_association_member`), not which unit a row belongs to — any role,
 * including tenant/prop_owner, can SELECT any bill in their association.
 * Unit-level scoping ("my unit only") is enforced at the app layer
 * everywhere else (see association-dashboard.tsx's owned/tenancy lookup),
 * so we replicate that same check here before serving a PDF.
 *
 * Owners may access every bill/receipt for a unit they own, regardless of
 * which tenancy was active when it was generated. Tenants may only access
 * bills/receipts attributed to their OWN tenancy (`billTenancyId`) — a bill
 * with no tenancy_id predates any tenant (self-occupied period) and stays
 * accessible, but a bill attributed to a *different* tenancy belongs to a
 * past or future tenant on the same unit and must stay hidden from this one.
 */
async function canAccessUnit(
  associationId: string,
  unitId: string,
  ownerId: string | null,
  billTenancyId: string | null,
): Promise<boolean> {
  const role = await getAssociationRole(associationId);

  if (role === 'assoc_admin' || role === 'billing_operator') {
    return true;
  }

  if (!role) {
    return false;
  }

  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return false;
  }

  if (ownerId && ownerId === user.id) {
    return true;
  }

  const tenancyId = await getActiveTenancyId(client, unitId, user.id);

  if (!tenancyId) {
    return false;
  }

  return billTenancyId === null || billTenancyId === tenancyId;
}

type UnitBillingFields = {
  bill_to: string;
  owner_id: string | null;
  owner_is_company: boolean;
  owner_company_name: string | null;
  owner_company_address: string | null;
  owner_company_gstin: string | null;
};

type TenancyBillingRow = {
  tenant_id: string;
  is_company: boolean;
  company_name: string | null;
  company_address: string | null;
  company_gstin: string | null;
};

/**
 * Resolves the billing entity for a unit.
 * - bill_to=auto: use the tenancy that was active when the bill was
 *   generated, if any, else owner.
 * - bill_to=owner: always owner.
 * - bill_to=tenant: use that tenancy if present, else fall back to owner.
 *
 * `tenancyId` is the specific tenancy row the bill was attributed to at
 * generation time (`bills.tenancy_id`) — NOT "whichever tenancy happens to
 * be active right now". Resolving against the current active tenancy would
 * make an old bill's "Bill To" name silently change to a new tenant's name
 * after a tenancy turnover and PDF cache regeneration.
 */
async function resolveBillingEntity(
  unit: UnitBillingFields,
  tenancyId: string | null,
): Promise<BillingEntityData> {
  const admin = getSupabaseServerAdminClient();

  let tenancy: TenancyBillingRow | null = null;

  if (unit.bill_to !== 'owner' && tenancyId) {
    const { data } = await admin
      .from('tenancies')
      .select(
        'tenant_id, is_company, company_name, company_address, company_gstin',
      )
      .eq('id', tenancyId)
      .maybeSingle();
    tenancy = (data as TenancyBillingRow | null) ?? null;
  }

  if (tenancy !== null) {
    if (tenancy.is_company) {
      return {
        isCompany: true,
        name: tenancy.company_name,
        companyAddress: tenancy.company_address,
        companyGstin: tenancy.company_gstin,
      };
    }
    const { data: profileData } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', tenancy.tenant_id)
      .maybeSingle();
    const profile = profileData as { full_name: string | null } | null;
    return {
      isCompany: false,
      name: profile?.full_name ?? null,
      companyAddress: null,
      companyGstin: null,
    };
  }

  // Bill to owner
  if (unit.owner_is_company) {
    return {
      isCompany: true,
      name: unit.owner_company_name,
      companyAddress: unit.owner_company_address,
      companyGstin: unit.owner_company_gstin,
    };
  }

  if (unit.owner_id) {
    const { data: profileData } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', unit.owner_id)
      .maybeSingle();
    const profile = profileData as { full_name: string | null } | null;
    return {
      isCompany: false,
      name: profile?.full_name ?? null,
      companyAddress: null,
      companyGstin: null,
    };
  }

  return {
    isCompany: false,
    name: null,
    companyAddress: null,
    companyGstin: null,
  };
}

/**
 * Returns the cached bill PDF if one exists, otherwise renders it, caches it
 * in the private `billing-documents` bucket, and stamps `bills.pdf_url`.
 *
 * Authorization is two-layered: the RLS-bound select below confirms the
 * caller is at least a member of the bill's association, then
 * `canAccessUnit` confirms admins/billing operators can see any unit while
 * owners/tenants are restricted to units they actually own or rent.
 *
 * Pass `{ skipAuth: true }` only from server-side generation flows (e.g.
 * post-generation pre-render) where the caller is already authorised.
 */
export async function getOrGenerateBillPdf(
  billId: string,
  opts?: { skipAuth?: boolean },
): Promise<GeneratedPdf | null> {
  // Auth is checked independently for every caller before consulting the
  // dedup map — without this, a concurrent second request could receive the
  // shared in-flight promise before its auth is checked.
  if (!opts?.skipAuth) {
    const client = getSupabaseServerClient();
    const { data: billMeta } = await client
      .from('bills')
      .select('association_id, unit_id, tenancy_id, units(owner_id)')
      .eq('id', billId)
      .maybeSingle();
    if (!billMeta) return null;
    const authorized = await canAccessUnit(
      billMeta.association_id,
      billMeta.unit_id,
      (billMeta.units as unknown as { owner_id: string | null } | null)
        ?.owner_id ?? null,
      billMeta.tenancy_id,
    );
    if (!authorized) return null;
  }

  const cacheKey = `bill_${billId}`;
  if (pendingPdfGenerations.has(cacheKey)) {
    return pendingPdfGenerations.get(cacheKey)!;
  }

  const generate = async (): Promise<GeneratedPdf | null> => {
    const logger = await getLogger();
    const admin = getSupabaseServerAdminClient();

    // Fetch the bill using the admin client to ensure we get the full
    // nested association + accounts join (which might otherwise be filtered
    // by RLS for non-members, obscuring the logo). We manually authorize
    // the user via `canAccessUnit` immediately below.
    const { data: bill, error: billError } = await admin
      .from('bills')
      .select(
        `id, association_id, unit_id, period, bill_no, bill_type, total_amount, gst_amount, paid_amount, advance_applied, status, due_date, generated_at, pdf_url, tenancy_id,
         units(unit_no, door_no, floor, type, bill_to, owner_id, owner_is_company, owner_company_name, owner_company_address, owner_company_gstin),
         bill_line_items(description, gst_applicable, amount, area_sqft, rate_per_sqft),
         associations(address, gstin, pan_number, registration_number, gst_enabled, gst_rate, authorised_signatory, email, phone, bank_account_name, bank_account_number, bank_name, bank_ifsc, bank_branch, accounts(name, picture_url))`,
      )
      .eq('id', billId)
      .maybeSingle();

    if (billError) {
      logger.error(
        { billId, error: billError },
        'Failed to fetch bill for PDF generation',
      );
      return null;
    }

    if (!bill || !bill.units || !bill.associations) {
      logger.warn(
        { billId, found: !!bill },
        'Bill not found, or missing unit/association join, when generating PDF',
      );
      return null;
    }

    if (
      !opts?.skipAuth &&
      !(await canAccessUnit(
        bill.association_id,
        bill.unit_id,
        (bill.units as unknown as { owner_id: string | null } | null)
          ?.owner_id ?? null,
        bill.tenancy_id,
      ))
    ) {
      logger.warn(
        { billId, associationId: bill.association_id, unitId: bill.unit_id },
        "Caller is not authorized to access this bill's unit",
      );
      return null;
    }

    const filename = `${bill.bill_no}.pdf`;

    if (bill.pdf_url) {
      const { data: signed } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(bill.pdf_url, 300);

      if (signed?.signedUrl) {
        return { signedUrl: signed.signedUrl, filename };
      }
      // Signed URL creation failed (e.g. object missing) — fall through and regenerate.
    }

    const association = bill.associations;
    const lineItems = bill.bill_line_items ?? [];

    // Type-assert the extended unit fields Supabase's codegen doesn't see
    type ExtendedUnit = {
      unit_no: string;
      door_no: string | null;
      floor: number | null;
      bill_to: string;
      owner_id: string | null;
      owner_is_company: boolean;
      owner_company_name: string | null;
      owner_company_address: string | null;
      owner_company_gstin: string | null;
      type: string | null;
    };
    const unitData = bill.units as unknown as ExtendedUnit;

    type ExtendedAssoc = typeof association & {
      pan_number: string | null;
      email: string | null;
      phone: string | null;
      bank_account_name: string | null;
      bank_account_number: string | null;
      bank_name: string | null;
      bank_ifsc: string | null;
      bank_branch: string | null;
    };
    const assocData = association as unknown as ExtendedAssoc;
    const panNumber = assocData.pan_number ?? null;

    let bytes: Buffer;

    if (bill.bill_type === 'electricity') {
      // CommonArea sub-meters are stored with a placeholder unit_id (the first
      // unit by unit_no) due to the NOT NULL FK constraint. For a Common Area
      // bill, query by meter_type + units join instead of unit_id.
      const isCommonAreaBill = unitData.type === 'Common Area';

      // Fetch mescom_bill, sub_meters, and billing entity in parallel — none
      // of these depend on each other.
      const [{ data: mescomBill }, { data: subMeters }, billTo] =
        await Promise.all([
          admin
            .from('mescom_bills')
            .select('id, invoice_amount, period_start, period_end')
            .eq('association_id', bill.association_id)
            .eq('period', bill.period)
            .maybeSingle(),
          isCommonAreaBill
            ? admin
                .from('sub_meters')
                .select(
                  'id, meter_label, load_kva, units!inner(association_id)',
                )
                .eq('meter_type', 'CommonArea')
                .eq('is_active', true)
                .eq('units.association_id', bill.association_id)
                .order('meter_label')
            : admin
                .from('sub_meters')
                .select('id, meter_label, load_kva')
                .eq('unit_id', bill.unit_id)
                // Exclude CommonArea meters: they carry a FK-placeholder unit_id
                // (the first unit), so they'd otherwise leak into that unit's bill.
                .neq('meter_type', 'CommonArea')
                .eq('is_active', true)
                .order('meter_label'),
          resolveBillingEntity(
            {
              bill_to: unitData.bill_to ?? 'auto',
              owner_id: unitData.owner_id,
              owner_is_company: unitData.owner_is_company ?? false,
              owner_company_name: unitData.owner_company_name ?? null,
              owner_company_address: unitData.owner_company_address ?? null,
              owner_company_gstin: unitData.owner_company_gstin ?? null,
            },
            bill.tenancy_id,
          ),
        ]);

      if (!mescomBill) {
        const logger = await getLogger();
        logger.warn(
          { billId: bill.id, period: bill.period },
          'generateElectricityBillPdf: no mescom bill found; rates will be zero',
        );
      }

      const subMeterIds = (subMeters ?? []).map((m) => m.id);

      // Fetch all readings for this mescom bill in one query.
      // Then partition: readings matching this unit's sub-meters → per-meter
      // breakdown table; all readings → denominator for the billing rate.
      // Rate = invoice ÷ sum of all sub-meter consumed units (distributes
      // transmission losses proportionally; includes CommonArea meters).
      const { data: allReadingsForBill } = mescomBill
        ? await admin
            .from('meter_readings')
            .select(
              'sub_meter_id, previous_reading, current_reading, consumed_units, minimum_charge',
            )
            .eq('mescom_bill_id', mescomBill.id)
        : { data: [] };

      const unitSubMeterIdSet = new Set(subMeterIds);
      const meterReadings = (allReadingsForBill ?? []).filter((r) =>
        unitSubMeterIdSet.has(r.sub_meter_id),
      );
      const totalSubMeterUnits = (allReadingsForBill ?? []).reduce(
        (sum, r) => sum + (r.consumed_units ?? 0),
        0,
      );

      const blockRate =
        mescomBill && totalSubMeterUnits > 0
          ? mescomBill.invoice_amount / totalSubMeterUnits
          : 0;

      const meterInfoById = new Map(
        (subMeters ?? []).map((m) => [
          m.id,
          { label: m.meter_label, loadKva: m.load_kva ?? null },
        ]),
      );

      let minimumCharge = 0;
      const meters = meterReadings.map((r) => {
        const consumed =
          r.consumed_units ?? r.current_reading - r.previous_reading;
        const amount = Math.round(consumed * blockRate * 100) / 100;
        minimumCharge += r.minimum_charge ?? 0;
        const info = meterInfoById.get(r.sub_meter_id);
        return {
          meterLabel: info?.label ?? r.sub_meter_id,
          previousReading: r.previous_reading,
          currentReading: r.current_reading,
          consumedUnits: consumed,
          blockRate,
          amount,
          loadKva: info?.loadKva ?? null,
        };
      });

      try {
        bytes = await renderElectricityBillPdf({
          association: {
            name: association.accounts?.name ?? 'Association',
            address: association.address,
            logoUrl: sanitizeLogoUrl(association.accounts?.picture_url),
            gstin: association.gstin,
            panNumber,
            registrationNumber: association.registration_number ?? null,
            authorisedSignatory: association.authorised_signatory,
            email: assocData.email ?? null,
            phone: assocData.phone ?? null,
            bankAccountName: assocData.bank_account_name ?? null,
            bankAccountNumber: assocData.bank_account_number ?? null,
            bankName: assocData.bank_name ?? null,
            bankIfsc: assocData.bank_ifsc ?? null,
            bankBranch: assocData.bank_branch ?? null,
          },
          unit: {
            unitNo: unitData.unit_no,
            doorNo: unitData.door_no ?? null,
            floor: unitData.floor ?? null,
          },
          billTo,
          bill: {
            billNo: bill.bill_no,
            period: bill.period,
            periodStart: mescomBill?.period_start ?? null,
            periodEnd: mescomBill?.period_end ?? null,
            dueDate: bill.due_date,
            generatedAt: bill.generated_at,
            totalAmount: bill.total_amount,
            paidAmount: bill.paid_amount,
          },
          meters,
          minimumCharge,
        });
      } catch (error) {
        logger.error(
          { billId, error },
          'Failed to render electricity bill PDF',
        );
        return null;
      }
    } else {
      const billTo = await resolveBillingEntity(
        {
          bill_to: unitData.bill_to ?? 'auto',
          owner_id: unitData.owner_id,
          owner_is_company: unitData.owner_is_company ?? false,
          owner_company_name: unitData.owner_company_name ?? null,
          owner_company_address: unitData.owner_company_address ?? null,
          owner_company_gstin: unitData.owner_company_gstin ?? null,
        },
        bill.tenancy_id,
      );
      try {
        bytes = await renderBillPdf({
          association: {
            name: association.accounts?.name ?? 'Association',
            address: association.address,
            gstin: association.gstin,
            panNumber,
            registrationNumber: association.registration_number ?? null,
            logoUrl: sanitizeLogoUrl(association.accounts?.picture_url),
            gstEnabled: association.gst_enabled,
            gstRate: association.gst_rate,
            email: assocData.email ?? null,
            phone: assocData.phone ?? null,
            bankAccountName: assocData.bank_account_name ?? null,
            bankAccountNumber: assocData.bank_account_number ?? null,
            bankName: assocData.bank_name ?? null,
            bankIfsc: assocData.bank_ifsc ?? null,
            bankBranch: assocData.bank_branch ?? null,
          },
          unit: {
            unitNo: unitData.unit_no,
            doorNo: unitData.door_no ?? null,
            floor: unitData.floor ?? null,
          },
          billTo,
          bill: {
            billNo: bill.bill_no,
            period: bill.period,
            dueDate: bill.due_date,
            generatedAt: bill.generated_at,
            totalAmount: bill.total_amount,
            gstAmount: bill.gst_amount ?? null,
            paidAmount: bill.paid_amount,
            advanceApplied: bill.advance_applied ?? 0,
            status: bill.status,
            billType: bill.bill_type,
          },
          lineItems: lineItems.map((item) => ({
            description: item.description,
            gstApplicable: item.gst_applicable,
            amount: item.amount,
            areaSqft: item.area_sqft ?? null,
            ratePerSqft: item.rate_per_sqft ?? null,
          })),
        });
      } catch (error) {
        logger.error({ billId, error }, 'Failed to render bill PDF');
        return null;
      }
    }

    const storagePath = `bills/${bill.association_id}/${bill.id}.pdf`;

    // Upload must be awaited: bills.pdf_url must be written before the next
    // request arrives so cache hits can return a signed URL instead of
    // re-rendering. Background void would lose the write on serverless.
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, bytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      logger.error(
        { billId, storagePath, error: uploadError },
        'Failed to cache generated bill PDF in storage',
      );
    } else {
      // bills.update and audit can run concurrently — saves ~100ms vs sequential.
      await Promise.all([
        admin
          .from('bills')
          .update({
            pdf_url: storagePath,
            pdf_generated_at: new Date().toISOString(),
          })
          .eq('id', billId),
        logAuditEvent({
          associationId: bill.association_id,
          action: 'bill.pdf_generated',
          entityType: 'bill',
          entityId: billId,
          summary: `Generated PDF for bill ${bill.bill_no}`,
        }),
      ]);
    }

    return { bytes, filename };
  };

  const promise = generate();
  pendingPdfGenerations.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    pendingPdfGenerations.delete(cacheKey);
  }
}

/**
 * Best-effort background PDF pre-render called after bill generation.
 * Skips auth — only invoke from server-side generation flows (generateBillsAction).
 * Errors are logged and swallowed so one failed render never blocks the others.
 */
export async function preRenderBillPdf(billId: string): Promise<void> {
  try {
    await getOrGenerateBillPdf(billId, { skipAuth: true });
  } catch (err) {
    const logger = await getLogger();
    logger.error(
      { billId, err },
      'preRenderBillPdf: background render failed — will render on first download instead',
    );
  }
}

/**
 * Same cache-then-generate pattern as getOrGenerateBillPdf, for a payment's receipt.
 */
export async function getOrGenerateReceiptPdf(
  paymentId: string,
): Promise<GeneratedPdf | null> {
  // Auth pre-check before the dedup map — see getOrGenerateBillPdf for rationale.
  const authClient = getSupabaseServerClient();
  const { data: paymentMeta } = await authClient
    .from('payments')
    .select('association_id, bills(unit_id, tenancy_id, units(owner_id))')
    .eq('id', paymentId)
    .maybeSingle();
  if (!paymentMeta?.bills) return null;
  const bill = paymentMeta.bills as unknown as {
    unit_id: string;
    tenancy_id: string | null;
    units: { owner_id: string | null } | null;
  };
  const authorized = await canAccessUnit(
    paymentMeta.association_id,
    bill.unit_id,
    bill.units?.owner_id ?? null,
    bill.tenancy_id,
  );
  if (!authorized) return null;

  const cacheKey = `receipt_${paymentId}`;
  if (pendingPdfGenerations.has(cacheKey)) {
    return pendingPdfGenerations.get(cacheKey)!;
  }

  const generate = async (): Promise<GeneratedPdf | null> => {
    const logger = await getLogger();
    const admin = getSupabaseServerAdminClient();

    // Fetch the payment using the admin client to ensure we get the full
    // nested association + accounts join (which might otherwise be filtered
    // by RLS for non-members, obscuring the logo). We manually authorize
    // the user via `canAccessUnit` immediately below.
    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .select(
        `id, association_id, amount, mode, reference_no, paid_at,
         bills(bill_no, period, unit_id, tenancy_id, units(unit_no, door_no, floor, bill_to, owner_id, owner_is_company, owner_company_name, owner_company_address, owner_company_gstin), associations(address, gstin, pan_number, registration_number, email, phone, bank_account_name, bank_account_number, bank_name, bank_ifsc, bank_branch, accounts(name, picture_url))),
         receipts(id, receipt_no, pdf_url, generated_at)`,
      )
      .eq('id', paymentId)
      .maybeSingle();

    if (paymentError) {
      logger.error(
        { paymentId, error: paymentError },
        'Failed to fetch payment for receipt PDF generation',
      );
      return null;
    }

    const receipt = payment?.receipts;

    if (
      !payment ||
      !payment.bills ||
      !payment.bills.units ||
      !payment.bills.associations ||
      !receipt
    ) {
      logger.warn(
        { paymentId, found: !!payment, hasReceipt: !!receipt },
        'Payment not found, missing bill/unit/association join, or no receipt, when generating receipt PDF',
      );
      return null;
    }

    if (
      !(await canAccessUnit(
        payment.association_id,
        payment.bills.unit_id,
        (payment.bills.units as unknown as { owner_id: string | null } | null)
          ?.owner_id ?? null,
        payment.bills.tenancy_id,
      ))
    ) {
      logger.warn(
        {
          paymentId,
          associationId: payment.association_id,
          unitId: payment.bills.unit_id,
        },
        "Caller is not authorized to access this payment's unit",
      );
      return null;
    }

    const filename = `${receipt.receipt_no}.pdf`;

    if (receipt.pdf_url) {
      const { data: signed } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(receipt.pdf_url, 300);

      if (signed?.signedUrl) {
        return { signedUrl: signed.signedUrl, filename };
      }
      // Signed URL creation failed (e.g. object missing) — fall through and regenerate.
    }

    type ExtendedUnit = {
      unit_no: string;
      door_no: string | null;
      floor: number | null;
      bill_to: string;
      owner_id: string | null;
      owner_is_company: boolean;
      owner_company_name: string | null;
      owner_company_address: string | null;
      owner_company_gstin: string | null;
    };
    const unitData = payment.bills.units as unknown as ExtendedUnit;

    const billTo = await resolveBillingEntity(
      {
        bill_to: unitData.bill_to ?? 'auto',
        owner_id: unitData.owner_id,
        owner_is_company: unitData.owner_is_company ?? false,
        owner_company_name: unitData.owner_company_name ?? null,
        owner_company_address: unitData.owner_company_address ?? null,
        owner_company_gstin: unitData.owner_company_gstin ?? null,
      },
      payment.bills.tenancy_id,
    );

    const association = payment.bills.associations;
    type ExtendedAssoc = typeof association & {
      pan_number: string | null;
      email: string | null;
      phone: string | null;
      bank_account_name: string | null;
      bank_account_number: string | null;
      bank_name: string | null;
      bank_ifsc: string | null;
      bank_branch: string | null;
    };
    const assocData = association as unknown as ExtendedAssoc;

    let bytes: Buffer;

    try {
      bytes = await renderReceiptPdf({
        association: {
          name: association.accounts?.name ?? 'Association',
          address: association.address,
          gstin: association.gstin,
          panNumber: assocData.pan_number ?? null,
          registrationNumber: association.registration_number ?? null,
          logoUrl: association.accounts?.picture_url ?? null,
          email: assocData.email ?? null,
          phone: assocData.phone ?? null,
          bankAccountName: assocData.bank_account_name ?? null,
          bankAccountNumber: assocData.bank_account_number ?? null,
          bankName: assocData.bank_name ?? null,
          bankIfsc: assocData.bank_ifsc ?? null,
          bankBranch: assocData.bank_branch ?? null,
        },
        unit: {
          unitNo: unitData.unit_no,
          doorNo: unitData.door_no ?? null,
          floor: unitData.floor ?? null,
        },
        billTo,
        bill: { billNo: payment.bills.bill_no, period: payment.bills.period },
        receipt: {
          receiptNo: receipt.receipt_no,
          generatedAt: receipt.generated_at,
        },
        payment: {
          amount: payment.amount,
          mode: payment.mode,
          paidAt: payment.paid_at,
          referenceNo:
            (payment as unknown as { reference_no: string | null })
              .reference_no ?? null,
        },
      });
    } catch (error) {
      logger.error({ paymentId, error }, 'Failed to render receipt PDF');
      return null;
    }

    const storagePath = `receipts/${payment.association_id}/${payment.id}.pdf`;

    // Upload must be awaited so receipts.pdf_url is written before the next
    // request; bills.update + audit run concurrently to save ~100ms.
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, bytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      logger.error(
        { paymentId, storagePath, error: uploadError },
        'Failed to cache generated receipt PDF in storage',
      );
    } else {
      await Promise.all([
        admin
          .from('receipts')
          .update({ pdf_url: storagePath })
          .eq('id', receipt.id),
        logAuditEvent({
          associationId: payment.association_id,
          action: 'receipt.pdf_generated',
          entityType: 'receipt',
          entityId: receipt.id,
          summary: `Generated PDF for receipt ${receipt.receipt_no}`,
        }),
      ]);
    }

    return { bytes, filename };
  };

  const promise = generate();
  pendingPdfGenerations.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    pendingPdfGenerations.delete(cacheKey);
  }
}
