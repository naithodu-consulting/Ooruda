import type { BillingEntityData } from '@kit/pdf-templates';

/**
 * Resolves owner billing entity from unit fields.
 * Falls back gracefully when owner_id is absent.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveOwnerEntity(
  unit: {
    owner_id: string | null;
    owner_is_company: boolean;
    owner_company_name: string | null;
    owner_company_address: string | null;
    owner_company_gstin: string | null;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
): Promise<BillingEntityData> {
  if (unit.owner_is_company) {
    return {
      isCompany: true,
      name: unit.owner_company_name,
      companyAddress: unit.owner_company_address,
      companyGstin: unit.owner_company_gstin,
    };
  }
  if (unit.owner_id) {
    const { data } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', unit.owner_id)
      .maybeSingle();
    return {
      isCompany: false,
      name: (data as { full_name: string | null } | null)?.full_name ?? null,
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
