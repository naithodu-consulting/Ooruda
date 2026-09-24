import type { SupabaseClient } from '@supabase/supabase-js';

import type { BillingEntityData } from '@kit/pdf-templates';
import { getLogger } from '@kit/shared/logger';

import type { Database } from '~/lib/database.types';

export interface BulkPaymentRecord {
  id: string;
  amount: number;
  mode: string;
  reference_no: string | null;
  paid_at: string;
  paid_by_role: string | null;
  receipt_no: string | null;
  /** The receipt row, and its cached PDF path when one has been rendered. */
  receipt_id: string | null;
  receipt_pdf_url: string | null;
  // Bill fields
  bill_no: string;
  bill_period: string;
  bill_type: string | null;
  tenancy_id: string | null;
  unit_id: string;
  // Unit fields
  unit_no: string;
  door_no: string | null;
  floor: number | null;
  bill_to: string;
  owner_id: string | null;
  owner_is_company: boolean;
  owner_company_name: string | null;
  owner_company_address: string | null;
  owner_company_gstin: string | null;
}

interface BulkReceiptLookups {
  tenancyById: Map<
    string,
    {
      tenant_id: string;
      is_company: boolean;
      company_name: string | null;
      company_address: string | null;
      company_gstin: string | null;
    }
  >;
  profileNameById: Map<string, string | null>;
}

export interface BulkReceiptAssociation {
  name: string;
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
}

export async function fetchBulkReceiptData(
  paymentIds: string[],
  associationId: string,
  admin: SupabaseClient<Database>,
): Promise<{
  payments: BulkPaymentRecord[];
  lookups: BulkReceiptLookups;
  association: BulkReceiptAssociation;
  associationLogoUrl: string | null;
}> {
  // Fetch payments with all required joins - payments table allows admin client
  const { data: rawPayments, error: paymentsError } = await admin
    .from('payments')
    .select(
      `id, amount, mode, reference_no, paid_at, paid_by_role,
       receipts(id, receipt_no, pdf_url),
       bills(bill_no, period, unit_id, tenancy_id,
         units(unit_no, door_no, floor, bill_to, owner_id, owner_is_company,
               owner_company_name, owner_company_address, owner_company_gstin),
         associations(address, gstin, pan_number, registration_number,
                      email, phone, bank_account_name, bank_account_number,
                      bank_name, bank_ifsc, bank_branch,
                      accounts(name, picture_url)))`,
    )
    .in('id', paymentIds)
    .eq('association_id', associationId);

  if (paymentsError)
    throw new Error(`Payments fetch failed: ${paymentsError.message}`);

  if (!rawPayments || rawPayments.length === 0) {
    return {
      payments: [],
      lookups: { tenancyById: new Map(), profileNameById: new Map() },
      association: {
        name: '',
        address: null,
        gstin: null,
        pan_number: null,
        registration_number: null,
        email: null,
        phone: null,
        bank_account_name: null,
        bank_account_number: null,
        bank_name: null,
        bank_ifsc: null,
        bank_branch: null,
      },
      associationLogoUrl: null,
    };
  }

  type RawBill = {
    bill_no: string;
    period: string;
    unit_id: string;
    tenancy_id: string | null;
    units: {
      unit_no: string;
      door_no: string | null;
      floor: number | null;
      bill_to: string;
      owner_id: string | null;
      owner_is_company: boolean;
      owner_company_name: string | null;
      owner_company_address: string | null;
      owner_company_gstin: string | null;
    } | null;
    associations: {
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
      accounts: { name: string | null; picture_url: string | null } | null;
    } | null;
  };

  // Extract association from first payment
  const firstBill = (rawPayments[0]! as unknown as { bills: RawBill | null })
    .bills;
  const assocData = firstBill?.associations;
  const association: BulkReceiptAssociation = {
    name: assocData?.accounts?.name ?? '',
    address: assocData?.address ?? null,
    gstin: assocData?.gstin ?? null,
    pan_number: assocData?.pan_number ?? null,
    registration_number: assocData?.registration_number ?? null,
    email: assocData?.email ?? null,
    phone: assocData?.phone ?? null,
    bank_account_name: assocData?.bank_account_name ?? null,
    bank_account_number: assocData?.bank_account_number ?? null,
    bank_name: assocData?.bank_name ?? null,
    bank_ifsc: assocData?.bank_ifsc ?? null,
    bank_branch: assocData?.bank_branch ?? null,
  };
  const associationLogoUrl = assocData?.accounts?.picture_url ?? null;

  // Flatten payment records
  const payments: BulkPaymentRecord[] = rawPayments
    .map((p) => {
      const bill = (p as unknown as { bills: RawBill | null }).bills;
      const u = bill?.units;
      type RawReceipt = {
        id: string;
        receipt_no: string;
        pdf_url: string | null;
      };
      const rawReceipt = (
        p as unknown as { receipts: RawReceipt | RawReceipt[] | null }
      ).receipts;
      const receipt = Array.isArray(rawReceipt)
        ? (rawReceipt[0] ?? null)
        : rawReceipt;
      const receiptNo = receipt?.receipt_no ?? null;
      if (!bill || !u) return null;
      return {
        id: p.id,
        amount: p.amount,
        mode: p.mode,
        reference_no: p.reference_no ?? null,
        paid_at: p.paid_at,
        paid_by_role: (p as unknown as { paid_by_role: string | null })
          .paid_by_role,
        receipt_no: receiptNo,
        receipt_id: receipt?.id ?? null,
        receipt_pdf_url: receipt?.pdf_url ?? null,
        bill_no: bill.bill_no,
        bill_period: bill.period,
        bill_type: null, // not needed for receipt rendering
        tenancy_id: bill.tenancy_id,
        unit_id: bill.unit_id,
        unit_no: u.unit_no,
        door_no: u.door_no,
        floor: u.floor,
        bill_to: u.bill_to,
        owner_id: u.owner_id,
        owner_is_company: u.owner_is_company,
        owner_company_name: u.owner_company_name,
        owner_company_address: u.owner_company_address,
        owner_company_gstin: u.owner_company_gstin,
      } satisfies BulkPaymentRecord;
    })
    .filter(Boolean) as BulkPaymentRecord[];

  // Batch fetch tenancies
  const tenancyIds = [
    ...new Set(payments.map((p) => p.tenancy_id).filter(Boolean) as string[]),
  ];
  const tenancyById = new Map<
    string,
    {
      tenant_id: string;
      is_company: boolean;
      company_name: string | null;
      company_address: string | null;
      company_gstin: string | null;
    }
  >();
  if (tenancyIds.length > 0) {
    const { data: tenancies, error: tenancyError } = await admin
      .from('tenancies')
      .select(
        'id, tenant_id, is_company, company_name, company_address, company_gstin',
      )
      .in('id', tenancyIds);
    if (tenancyError)
      throw new Error(`Tenancies fetch failed: ${tenancyError.message}`);
    for (const t of tenancies ?? []) {
      tenancyById.set(t.id, {
        tenant_id: t.tenant_id,
        is_company: (t as unknown as { is_company: boolean }).is_company,
        company_name: (t as unknown as { company_name: string | null })
          .company_name,
        company_address: (t as unknown as { company_address: string | null })
          .company_address,
        company_gstin: (t as unknown as { company_gstin: string | null })
          .company_gstin,
      });
    }
  }

  // Batch fetch profiles (tenants + owners)
  const tenantIds = [...tenancyById.values()]
    .filter((t) => !t.is_company)
    .map((t) => t.tenant_id);
  const ownerIds = [
    ...new Set(payments.map((p) => p.owner_id).filter(Boolean) as string[]),
  ];
  const allProfileIds = [...new Set([...tenantIds, ...ownerIds])];
  const profileNameById = new Map<string, string | null>();
  if (allProfileIds.length > 0) {
    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id, full_name')
      .in('id', allProfileIds);
    if (profilesError)
      throw new Error(`Profiles fetch failed: ${profilesError.message}`);
    for (const p of profiles ?? []) {
      profileNameById.set(
        p.id,
        (p as unknown as { full_name: string | null }).full_name,
      );
    }
  }

  return {
    payments,
    lookups: { tenancyById, profileNameById },
    association,
    associationLogoUrl,
  };
}

function resolveReceivedFrom(
  payment: BulkPaymentRecord,
  lookups: BulkReceiptLookups,
): BillingEntityData {
  const paidByRole = payment.paid_by_role ?? 'Owner';
  const tenancyId = payment.tenancy_id;

  if (paidByRole === 'Tenant' && tenancyId) {
    const tenancy = lookups.tenancyById.get(tenancyId);
    if (tenancy) {
      if (tenancy.is_company) {
        return {
          isCompany: true,
          name: tenancy.company_name,
          companyAddress: tenancy.company_address,
          companyGstin: tenancy.company_gstin,
        };
      }
      return {
        isCompany: false,
        name: lookups.profileNameById.get(tenancy.tenant_id) ?? null,
        companyAddress: null,
        companyGstin: null,
      };
    }
  }

  // Fall back to owner
  if (payment.owner_is_company) {
    return {
      isCompany: true,
      name: payment.owner_company_name,
      companyAddress: payment.owner_company_address,
      companyGstin: payment.owner_company_gstin,
    };
  }
  return {
    isCompany: false,
    name: payment.owner_id
      ? (lookups.profileNameById.get(payment.owner_id) ?? null)
      : null,
    companyAddress: null,
    companyGstin: null,
  };
}

export async function renderReceiptFromPrefetch(
  payment: BulkPaymentRecord,
  logoDataUri: string | null,
  association: BulkReceiptAssociation,
  lookups: BulkReceiptLookups,
  renderer: Pick<typeof import('@kit/pdf-templates'), 'renderReceiptPdf'>,
): Promise<Buffer | null> {
  const { renderReceiptPdf } = renderer;
  try {
    const receiptNo =
      payment.receipt_no ?? `RCP-${payment.id.slice(0, 8).toUpperCase()}`;
    const period = payment.bill_period;
    const receivedFrom = resolveReceivedFrom(payment, lookups);

    return await renderReceiptPdf({
      association: {
        name: association.name,
        address: association.address,
        gstin: association.gstin,
        panNumber: association.pan_number,
        registrationNumber: association.registration_number,
        logoUrl: logoDataUri,
        email: association.email,
        phone: association.phone,
        bankAccountName: association.bank_account_name,
        bankAccountNumber: association.bank_account_number,
        bankName: association.bank_name,
        bankIfsc: association.bank_ifsc,
        bankBranch: association.bank_branch,
      },
      unit: {
        unitNo: payment.unit_no,
        doorNo: payment.door_no,
        floor: payment.floor,
      },
      billTo: receivedFrom,
      bill: { billNo: payment.bill_no, period },
      receipt: {
        receiptNo,
        generatedAt: new Date().toISOString(),
      },
      payment: {
        amount: payment.amount,
        mode: payment.mode,
        paidAt: payment.paid_at,
        referenceNo: payment.reference_no,
      },
    });
  } catch (err) {
    const logger = await getLogger();
    logger.error(
      { paymentId: payment.id, err },
      'renderReceiptFromPrefetch: render failed',
    );
    return null;
  }
}
