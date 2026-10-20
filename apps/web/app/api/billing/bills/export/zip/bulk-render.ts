/**
 * Bulk PDF rendering helpers for the ZIP export route.
 *
 * The core idea: fetch ALL data for N bills in 6 fixed queries (regardless of N),
 * build in-memory lookup Maps, then render each bill from those maps with zero
 * additional DB calls. This eliminates the N+1 problem in renderBillPdfBuffer.
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { BillingEntityData } from '@kit/pdf-templates';
import { getLogger } from '@kit/shared/logger';

// ── Types ────────────────────────────────────────────────────────────────────

export type BulkBillRecord = {
  id: string;
  association_id: string;
  unit_id: string;
  period: string;
  bill_no: string;
  bill_type: string | null;
  total_amount: number;
  gst_amount: number | null;
  paid_amount: number;
  advance_applied: number | null;
  status: string;
  due_date: string;
  generated_at: string;
  tenancy_id: string | null;
  pdf_url: string | null;
  units: {
    unit_no: string;
    door_no: string | null;
    floor: number | null;
    type: string | null;
    bill_to: string;
    owner_id: string | null;
    owner_is_company: boolean;
    owner_company_name: string | null;
    owner_company_address: string | null;
    owner_company_gstin: string | null;
  } | null;
  bill_line_items: {
    description: string;
    gst_applicable: boolean;
    amount: number;
    area_sqft: number | null;
    rate_per_sqft: number | null;
  }[];
  associations: {
    address: string | null;
    gstin: string | null;
    pan_number: string | null;
    registration_number: string | null;
    gst_enabled: boolean | null;
    gst_rate: number | null;
    authorised_signatory: string | null;
    email: string | null;
    phone: string | null;
    bank_account_name: string | null;
    bank_account_number: string | null;
    bank_name: string | null;
    bank_ifsc: string | null;
    bank_branch: string | null;
    accounts: { name: string | null } | null;
  } | null;
};

type MescomBill = {
  id: string;
  invoice_amount: number;
  period_start: string | null;
  period_end: string | null;
};

type SubMeter = {
  id: string;
  unit_id: string | null;
  meter_label: string;
  load_kva: number | null;
  meter_type: string;
};

type MeterReading = {
  sub_meter_id: string;
  previous_reading: number;
  current_reading: number;
  consumed_units: number | null;
  minimum_charge: number | null;
};

type Tenancy = {
  id: string;
  tenant_id: string;
  is_company: boolean;
  company_name: string | null;
  company_address: string | null;
  company_gstin: string | null;
};

export type BulkLookups = {
  /** key: `${associationId}:${period}` */
  mescomByPeriod: Map<string, MescomBill>;
  /** key: mescomBillId → readings */
  readingsByMescomBill: Map<string, MeterReading[]>;
  /** key: unitId → that unit's sub-meters */
  subMetersByUnit: Map<string, SubMeter[]>;
  /** CommonArea sub-meters for this association */
  commonAreaSubMeters: SubMeter[];
  /** key: tenancyId */
  tenancyById: Map<string, Tenancy>;
  /** key: userId → full_name */
  profileNameById: Map<string, string | null>;
};

// ── Batch fetch ───────────────────────────────────────────────────────────────

/**
 * Fetch ALL data for `billIds` in 6 queries, return both the bill records
 * and the lookup maps needed to render them.
 *
 * Query count is O(1) regardless of how many bills are requested.
 */
export async function fetchBulkBillData(
  billIds: string[],
  associationId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any>,
): Promise<{ bills: BulkBillRecord[]; lookups: BulkLookups }> {
  // ── Query 1: all bills with joins ────────────────────────────────────────
  const { data: rawBills, error: billsError } = await admin
    .from('bills')
    .select(
      `id, association_id, unit_id, period, bill_no, bill_type,
       total_amount, gst_amount, paid_amount, advance_applied, status,
       due_date, generated_at, tenancy_id, pdf_url,
       units(unit_no, door_no, floor, type, bill_to, owner_id,
             owner_is_company, owner_company_name, owner_company_address, owner_company_gstin),
       bill_line_items(description, gst_applicable, amount, area_sqft, rate_per_sqft),
       associations(address, gstin, pan_number, registration_number,
                   gst_enabled, gst_rate, authorised_signatory,
                   email, phone, bank_account_name, bank_account_number,
                   bank_name, bank_ifsc, bank_branch, accounts(name))`,
    )
    .eq('association_id', associationId)
    .in('id', billIds);

  if (billsError) throw new Error(`Bills fetch failed: ${billsError.message}`);

  const bills = (rawBills ?? []) as unknown as BulkBillRecord[];

  // Collect distinct keys for subsequent batch queries
  const electricityBills = bills.filter((b) => b.bill_type === 'electricity');
  const distinctPeriods = [...new Set(electricityBills.map((b) => b.period))];
  const distinctUnitIds = [
    ...new Set(
      electricityBills
        .filter((b) => b.units?.type !== 'Common Area')
        .map((b) => b.unit_id),
    ),
  ];
  const hasCommonArea = electricityBills.some(
    (b) => b.units?.type === 'Common Area',
  );

  const allTenancyIds = [
    ...new Set(bills.map((b) => b.tenancy_id).filter(Boolean) as string[]),
  ];
  // Collect all user IDs that need name resolution (tenants + owners)
  // We'll populate these after fetching tenancies.

  // ── Queries 2-4: electricity data (skip if no electricity bills) ─────────
  const mescomByPeriod = new Map<string, MescomBill>();
  const readingsByMescomBill = new Map<string, MeterReading[]>();
  const subMetersByUnit = new Map<string, SubMeter[]>();
  let commonAreaSubMeters: SubMeter[] = [];

  if (electricityBills.length > 0) {
    // Query 2: mescom_bills for all distinct periods
    const [mescomResult, subMeterResults] = await Promise.all([
      distinctPeriods.length > 0
        ? admin
            .from('mescom_bills')
            .select('id, invoice_amount, period_start, period_end, period')
            .eq('association_id', associationId)
            .in('period', distinctPeriods)
        : { data: [], error: null },
      // Query 3a+3b: sub_meters - one query per unit batch + optional CommonArea
      Promise.all([
        distinctUnitIds.length > 0
          ? admin
              .from('sub_meters')
              .select('id, unit_id, meter_label, load_kva, meter_type')
              .in('unit_id', distinctUnitIds)
              .neq('meter_type', 'CommonArea')
              .eq('is_active', true)
          : { data: [], error: null },
        hasCommonArea
          ? admin
              .from('sub_meters')
              .select(
                'id, meter_label, load_kva, meter_type, units!inner(association_id)',
              )
              .eq('meter_type', 'CommonArea')
              .eq('is_active', true)
              .eq('units.association_id', associationId)
          : { data: [], error: null },
      ]),
    ]);

    if (mescomResult.error)
      throw new Error(
        `mescom_bills fetch failed: ${mescomResult.error.message}`,
      );
    const [unitSubMeterResult, caSubMeterResult] = subMeterResults;
    if (unitSubMeterResult.error)
      throw new Error(
        `sub_meters fetch failed: ${unitSubMeterResult.error.message}`,
      );
    if (caSubMeterResult.error)
      throw new Error(
        `sub_meters (CommonArea) fetch failed: ${caSubMeterResult.error.message}`,
      );

    // Build mescom lookup by period
    const mescomRows_ = (mescomResult.data ?? []) as (MescomBill & {
      period: string;
    })[];
    for (const m of mescomRows_) {
      mescomByPeriod.set(`${associationId}:${m.period}`, m);
    }

    // Build sub_meter lookup by unit
    for (const sm of (unitSubMeterResult.data ?? []) as SubMeter[]) {
      const arr = subMetersByUnit.get(sm.unit_id!) ?? [];
      arr.push(sm);
      subMetersByUnit.set(sm.unit_id!, arr);
    }
    commonAreaSubMeters = (caSubMeterResult.data ??
      []) as unknown as SubMeter[];

    // Query 4: meter_readings for all mescom bills at once
    const mescomIds = mescomRows_.map((m) => m.id);
    if (mescomIds.length > 0) {
      const { data: readings, error: readingsError } = await admin
        .from('meter_readings')
        .select(
          'sub_meter_id, previous_reading, current_reading, consumed_units, minimum_charge, mescom_bill_id',
        )
        .in('mescom_bill_id', mescomIds);
      if (readingsError)
        throw new Error(
          `meter_readings fetch failed: ${readingsError.message}`,
        );

      for (const r of (readings ?? []) as (MeterReading & {
        mescom_bill_id: string;
      })[]) {
        const arr = readingsByMescomBill.get(r.mescom_bill_id) ?? [];
        arr.push(r);
        readingsByMescomBill.set(r.mescom_bill_id, arr);
      }
    }
  }

  // ── Query 5: tenancies ───────────────────────────────────────────────────
  const tenancyById = new Map<string, Tenancy>();
  const tenantUserIds: string[] = [];

  if (allTenancyIds.length > 0) {
    const { data: tenancyRows, error: tenancyError } = await admin
      .from('tenancies')
      .select(
        'id, tenant_id, is_company, company_name, company_address, company_gstin',
      )
      .in('id', allTenancyIds);
    if (tenancyError)
      throw new Error(`tenancies fetch failed: ${tenancyError.message}`);

    for (const t of (tenancyRows ?? []) as Tenancy[]) {
      tenancyById.set(t.id, t);
      if (!t.is_company) tenantUserIds.push(t.tenant_id);
    }
  }

  // ── Query 6: profiles (tenants + owners in one shot) ────────────────────
  const ownerIds = [
    ...new Set(bills.map((b) => b.units?.owner_id).filter(Boolean) as string[]),
  ];
  const allUserIds = [...new Set([...tenantUserIds, ...ownerIds])];
  const profileNameById = new Map<string, string | null>();

  if (allUserIds.length > 0) {
    const { data: profileRows, error: profilesError } = await admin
      .from('profiles')
      .select('id, full_name')
      .in('id', allUserIds);
    if (profilesError)
      throw new Error(`profiles fetch failed: ${profilesError.message}`);

    for (const p of (profileRows ?? []) as {
      id: string;
      full_name: string | null;
    }[]) {
      profileNameById.set(p.id, p.full_name ?? null);
    }
  }

  return {
    bills,
    lookups: {
      mescomByPeriod,
      readingsByMescomBill,
      subMetersByUnit,
      commonAreaSubMeters,
      tenancyById,
      profileNameById,
    },
  };
}

// ── Per-bill rendering (no DB calls) ─────────────────────────────────────────

function resolveBillingEntityFromLookups(
  unit: BulkBillRecord['units'],
  tenancyId: string | null,
  lookups: BulkLookups,
): BillingEntityData {
  // Mirror the logic in resolveBillingEntity() in pdf-generation.ts:
  // bill_to='owner' → always use owner, even if a tenancy exists.
  // bill_to='auto'|'tenant' → prefer tenancy if present, else fall back to owner.
  const billTo = unit?.bill_to ?? 'auto';
  if (billTo !== 'owner' && tenancyId) {
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
  if (!unit)
    return {
      isCompany: false,
      name: null,
      companyAddress: null,
      companyGstin: null,
    };

  if (unit.owner_is_company) {
    return {
      isCompany: true,
      name: unit.owner_company_name,
      companyAddress: unit.owner_company_address,
      companyGstin: unit.owner_company_gstin,
    };
  }

  return {
    isCompany: false,
    name: unit.owner_id
      ? (lookups.profileNameById.get(unit.owner_id) ?? null)
      : null,
    companyAddress: null,
    companyGstin: null,
  };
}

/**
 * Render a single bill to a Buffer using pre-fetched data - zero DB calls.
 * All data comes from the lookup maps built by fetchBulkBillData.
 */
export async function renderBillFromPrefetch(
  bill: BulkBillRecord,
  logoDataUri: string | null,
  lookups: BulkLookups,
  renderer: Pick<
    typeof import('@kit/pdf-templates'),
    'renderBillPdf' | 'renderElectricityBillPdf'
  >,
): Promise<Buffer | null> {
  const { renderBillPdf, renderElectricityBillPdf } = renderer;
  if (!bill.units || !bill.associations) return null;

  const unitData = bill.units;
  const assoc = bill.associations;
  const billTo = resolveBillingEntityFromLookups(
    unitData,
    bill.tenancy_id,
    lookups,
  );

  const assocBranding = {
    name: assoc.accounts?.name ?? 'Association',
    address: assoc.address,
    logoUrl: logoDataUri,
    gstin: assoc.gstin,
    panNumber: assoc.pan_number ?? null,
    registrationNumber: assoc.registration_number ?? null,
    email: assoc.email ?? null,
    phone: assoc.phone ?? null,
    bankAccountName: assoc.bank_account_name ?? null,
    bankAccountNumber: assoc.bank_account_number ?? null,
    bankName: assoc.bank_name ?? null,
    bankIfsc: assoc.bank_ifsc ?? null,
    bankBranch: assoc.bank_branch ?? null,
  };

  const unitInfo = {
    unitNo: unitData.unit_no,
    doorNo: unitData.door_no ?? null,
    floor: unitData.floor ?? null,
  };

  try {
    if (bill.bill_type === 'electricity') {
      const mescomKey = `${bill.association_id}:${bill.period}`;
      const mescomBill = lookups.mescomByPeriod.get(mescomKey) ?? null;
      const isCommonArea = unitData.type === 'Common Area';

      const subMeters = isCommonArea
        ? lookups.commonAreaSubMeters
        : (lookups.subMetersByUnit.get(bill.unit_id) ?? []);

      const allReadings = mescomBill
        ? (lookups.readingsByMescomBill.get(mescomBill.id) ?? [])
        : [];

      const subMeterIdSet = new Set(subMeters.map((m) => m.id));
      const meterReadings = allReadings.filter((r) =>
        subMeterIdSet.has(r.sub_meter_id),
      );
      const totalUnits = allReadings.reduce(
        (s, r) => s + (r.consumed_units ?? 0),
        0,
      );
      const blockRate =
        mescomBill && totalUnits > 0
          ? mescomBill.invoice_amount / totalUnits
          : 0;

      const meterInfoById = new Map(
        subMeters.map((m) => [
          m.id,
          { label: m.meter_label, loadKva: m.load_kva ?? null },
        ]),
      );
      let minimumCharge = 0;
      const meters = meterReadings.map((r) => {
        const consumed =
          r.consumed_units ?? r.current_reading - r.previous_reading;
        minimumCharge += r.minimum_charge ?? 0;
        const info = meterInfoById.get(r.sub_meter_id);
        return {
          meterLabel: info?.label ?? r.sub_meter_id,
          previousReading: r.previous_reading,
          currentReading: r.current_reading,
          consumedUnits: consumed,
          blockRate,
          amount: Math.round(consumed * blockRate * 100) / 100,
          loadKva: info?.loadKva ?? null,
        };
      });

      return await renderElectricityBillPdf({
        association: {
          ...assocBranding,
          authorisedSignatory: assoc.authorised_signatory,
        },
        unit: unitInfo,
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
          advanceApplied: bill.advance_applied ?? null,
        },
        meters,
        minimumCharge,
      });
    } else {
      const lineItems = bill.bill_line_items.map((item) => ({
        description: item.description,
        gstApplicable: item.gst_applicable,
        amount: item.amount,
        areaSqft: item.area_sqft ?? null,
        ratePerSqft: item.rate_per_sqft ?? null,
      }));

      return await renderBillPdf({
        association: {
          ...assocBranding,
          gstEnabled: assoc.gst_enabled ?? false,
          gstRate: assoc.gst_rate,
        },
        unit: unitInfo,
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
        lineItems,
      });
    }
  } catch (err) {
    const logger = await getLogger();
    logger.error(
      { billId: bill.id, bill_type: bill.bill_type, err },
      'renderBillFromPrefetch: render failed',
    );
    return null;
  }
}
