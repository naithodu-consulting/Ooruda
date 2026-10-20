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

/**
 * "Received from" on a deposit or cash-ledger receipt: the tenancy captured
 * at payment time when a tenant paid, otherwise the owner. The stored
 * tenancy id survives tenant turnover, so it always names the historical
 * payer rather than whoever rents the unit today.
 */
export async function resolvePaidByEntity(
  paidByRole: string,
  tenancyId: string | null,
  unit: Parameters<typeof resolveOwnerEntity>[0],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
): Promise<BillingEntityData> {
  if (paidByRole !== 'Tenant' || !tenancyId) {
    return resolveOwnerEntity(unit, admin);
  }

  const { data: tenancy } = await admin
    .from('tenancies')
    .select(
      'tenant_id, is_company, company_name, company_address, company_gstin',
    )
    .eq('id', tenancyId)
    .maybeSingle();

  if (!tenancy) {
    return resolveOwnerEntity(unit, admin);
  }

  const row = tenancy as {
    tenant_id: string;
    is_company: boolean;
    company_name: string | null;
    company_address: string | null;
    company_gstin: string | null;
  };

  if (row.is_company) {
    return {
      isCompany: true,
      name: row.company_name,
      companyAddress: row.company_address,
      companyGstin: row.company_gstin,
    };
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', row.tenant_id)
    .maybeSingle();

  return {
    isCompany: false,
    name: (profile as { full_name: string | null } | null)?.full_name ?? null,
    companyAddress: null,
    companyGstin: null,
  };
}
