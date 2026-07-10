'use server';

import { revalidatePath } from 'next/cache';

import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { logAuditEvent } from '~/lib/audit-log';
import { getAssociationRole } from '~/lib/rbac';

import { type GenerateBillsInput, GenerateBillsSchema } from './billing-schema';

const BILLING_PATH = '/home/[account]/billing';

type ActionResult = { success: boolean; error?: string };
type GenerateBillsResult = ActionResult & {
  created?: number;
  skipped?: number;
};

async function requireBillingAccess(
  associationId: string,
): Promise<string | null> {
  const role = await getAssociationRole(associationId);

  if (role !== 'assoc_admin' && role !== 'billing_operator') {
    return 'Only an association admin or billing operator can do that.';
  }

  return null;
}

export async function generateBillsAction(
  associationId: string,
  input: GenerateBillsInput,
): Promise<GenerateBillsResult> {
  const roleError = await requireBillingAccess(associationId);

  if (roleError) {
    return { success: false, error: roleError };
  }

  const parsed = GenerateBillsSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Please check the form.',
    };
  }

  const { period, billType } = parsed.data;
  const client = getSupabaseServerClient();

  const { data: units } = await client
    .from('units')
    .select('id, unit_no, type, area_sqft')
    .eq('association_id', associationId);

  const unitRows = units ?? [];

  if (unitRows.length === 0) {
    return { success: false, error: 'Add units before generating bills.' };
  }

  const { data: chargeTypes } = await client
    .from('charge_types')
    .select(
      'id, key, name, calc_method, rate_or_amount, default_payer, gst_applicable',
    )
    .eq('association_id', associationId)
    .eq('is_active', true);

  const activeChargeTypes = chargeTypes ?? [];

  if (activeChargeTypes.length === 0) {
    return { success: false, error: 'No active charge types to bill.' };
  }

  const unitIds = unitRows.map((u) => u.id);

  const { data: overrides } = await client
    .from('unit_charge_overrides')
    .select(
      'unit_id, charge_type_id, payer_override, rate_or_amount_override, is_excluded',
    )
    .in('unit_id', unitIds);

  const overrideByKey = new Map(
    (overrides ?? []).map((o) => [`${o.unit_id}:${o.charge_type_id}`, o]),
  );

  const { data: billingSettings } = await client
    .from('billing_settings')
    .select('electricity_due_day, maintenance_due_day, other_charges_due_day')
    .eq('association_id', associationId)
    .single();

  const { data: association, error: associationError } = await client
    .from('associations')
    .select('gst_enabled, gst_rate')
    .eq('id', associationId)
    .single();

  if (associationError || !association) {
    return {
      success: false,
      error: 'Could not load association settings.',
    };
  }

  const gstEnabled = association.gst_enabled ?? false;
  const gstRate = association.gst_rate ?? 0;
  const calculateDueDate = (billingPeriod: string, day: number) =>
    `${billingPeriod}-${String(day).padStart(2, '0')}`;
  // Electricity bills are due in the NEXT calendar month after the billing period.
  const elecPeriod = (() => {
    const [y, m] = period.split('-').map(Number);
    const d = new Date(y!, m!, 1); // JS months are 0-indexed, so m (1-based) = next month
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const elecDueDate = calculateDueDate(
    elecPeriod,
    billingSettings?.electricity_due_day ?? 10,
  );
  const maintDueDate = calculateDueDate(
    period,
    billingSettings?.maintenance_due_day ?? 10,
  );
  const otherDueDate = calculateDueDate(
    period,
    billingSettings?.other_charges_due_day ?? 10,
  );

  const otherChargesCT = activeChargeTypes.find(
    (c) => c.key === 'other_charges',
  );

  const { data: pendingCharges } = otherChargesCT
    ? await client
        .from('pending_other_charges')
        .select('id, unit_id, label, amount, split_mode')
        .eq('association_id', associationId)
        .eq('period', period)
    : { data: [] };

  const pendingRows = pendingCharges ?? [];

  const hasElectricityChargeType = activeChargeTypes.some(
    (c) => c.calc_method === 'electricity',
  );

  let blockRate: number | null = null;
  const consumedByUnit: Record<string, number> = {};
  const minimumChargeByUnit: Record<string, number> = {};

  if (hasElectricityChargeType) {
    const { data: mescomBill } = await client
      .from('mescom_bills')
      .select('invoice_amount')
      .eq('association_id', associationId)
      .eq('period', period)
      .maybeSingle();

    if (mescomBill && mescomBill.invoice_amount > 0) {
      const { data: subMeters } = await client
        .from('sub_meters')
        .select('id, unit_id')
        .in('unit_id', unitIds);

      const subMeterIds = (subMeters ?? []).map((m) => m.id);
      const unitIdBySubMeter = new Map(
        (subMeters ?? []).map((m) => [m.id, m.unit_id]),
      );

      if (subMeterIds.length > 0) {
        const { data: readings } = await client
          .from('meter_readings')
          .select('sub_meter_id, consumed_units, minimum_charge')
          .eq('period', period)
          .in('sub_meter_id', subMeterIds);

        let totalSubMeterUnits = 0;
        for (const r of readings ?? []) {
          const unitId = unitIdBySubMeter.get(r.sub_meter_id);
          if (unitId) {
            consumedByUnit[unitId] =
              (consumedByUnit[unitId] ?? 0) + (r.consumed_units ?? 0);
            minimumChargeByUnit[unitId] =
              (minimumChargeByUnit[unitId] ?? 0) + (r.minimum_charge ?? 0);
          }
          totalSubMeterUnits += r.consumed_units ?? 0;
        }

        // Rate = invoice ÷ sum of all sub-meter consumed units for this association.
        // Includes CommonArea meters (their unit_id rows are in unitIds since the
        // units query at the top fetches all units without a type filter).
        // This is higher than the MESCOM block rate — transmission losses are
        // distributed proportionally so the full invoice is always recovered.
        if (totalSubMeterUnits > 0) {
          blockRate = mescomBill.invoice_amount / totalSubMeterUnits;
        } else {
          const logger = await getLogger();
          logger.warn(
            { associationId, period },
            'generateBills: no sub-meter readings found; electricity blockRate stays null',
          );
        }
      }
    }
  }

  const { data: existingBills } = await client
    .from('bills')
    .select('unit_id, bill_no')
    .eq('association_id', associationId)
    .eq('period', period);

  const existingByUnit = new Map<string, string[]>();
  for (const b of existingBills ?? []) {
    const list = existingByUnit.get(b.unit_id) ?? [];
    list.push(b.bill_no);
    existingByUnit.set(b.unit_id, list);
  }

  let created = 0;
  let skipped = 0;

  const roundToTwoDecimals = (val: number) => Math.round(val * 100) / 100;

  const shouldGenElec = billType === 'All' || billType === 'Electricity';
  const shouldGenMaint = billType === 'All' || billType === 'Maintenance';
  const shouldGenOther = billType === 'All' || billType === 'Other Charges';

  for (const unit of unitRows) {
    const existing = existingByUnit.get(unit.id) || [];
    const hasElec = existing.some(
      (b: string) => b.includes('-ELEC-') || b.includes('/ELT/'),
    );
    const hasMaint = existing.some(
      (b: string) => b.includes('-MANT-') || b.includes('/MNT/'),
    );
    const hasOther = existing.some(
      (b: string) => b.includes('-OTHR-') || b.includes('/OTH/'),
    );

    if (unit.type === 'Common Area') {
      if (hasElec) {
        skipped++;
        continue;
      }
    } else {
      if (hasElec && hasMaint && hasOther) {
        skipped++;
        continue;
      }
    }

    type LineItem = {
      charge_type_id: string;
      description: string;
      payer: string;
      gst_applicable: boolean;
      amount: number;
    };

    const elecItems: LineItem[] = [];
    const maintItems: LineItem[] = [];
    const otherItems: LineItem[] = [];

    // Map charge types to correct bill type
    for (const chargeType of activeChargeTypes) {
      const override = overrideByKey.get(`${unit.id}:${chargeType.id}`);

      if (override?.is_excluded) {
        continue;
      }

      const payer = override?.payer_override ?? chargeType.default_payer;
      let amount: number;

      if (chargeType.calc_method === 'electricity') {
        if (blockRate === null) continue;
        const consumed = consumedByUnit[unit.id] ?? 0;
        const minCharge = minimumChargeByUnit[unit.id] ?? 0;
        amount = consumed * blockRate + minCharge;

        elecItems.push({
          charge_type_id: chargeType.id,
          description: chargeType.name,
          payer,
          gst_applicable: chargeType.gst_applicable,
          amount: roundToTwoDecimals(amount),
        });
      } else {
        const rate =
          override?.rate_or_amount_override ?? chargeType.rate_or_amount;

        if (rate === null || rate === undefined) {
          continue;
        }

        amount =
          chargeType.calc_method === 'per_sqft' ? rate * unit.area_sqft : rate;

        const item = {
          charge_type_id: chargeType.id,
          description: chargeType.name,
          payer,
          gst_applicable: chargeType.gst_applicable,
          amount: roundToTwoDecimals(amount),
        };

        if (chargeType.key === 'maintenance') {
          maintItems.push(item);
        } else if (chargeType.key !== 'other_charges') {
          // e.g. water, penalties, or custom types map to Other Charges bill
          otherItems.push(item);
        }
      }
    }

    // Append staged other charges to Other bill
    if (otherChargesCT) {
      for (const pc of pendingRows) {
        if (pc.unit_id !== null && pc.unit_id !== unit.id) continue;

        let pcAmount: number;
        if (pc.unit_id === null) {
          if (pc.split_mode === 'per_sqft') {
            if (unit.area_sqft == null) continue; // can't split without area
            pcAmount = roundToTwoDecimals(pc.amount * unit.area_sqft);
          } else {
            pcAmount = roundToTwoDecimals(pc.amount);
          }
        } else {
          pcAmount = roundToTwoDecimals(pc.amount);
        }

        otherItems.push({
          charge_type_id: otherChargesCT.id,
          description: pc.label,
          payer: otherChargesCT.default_payer ?? 'Owner',
          gst_applicable: otherChargesCT.gst_applicable ?? false,
          amount: pcAmount,
        });
      }
    }

    // Helper to generate bill
    const generateSpecificBill = async (
      type: string,
      typePrefix: string,
      items: LineItem[],
      dueDate: string,
    ) => {
      if (items.length === 0) return true; // nothing to bill

      const { data: billNo, error: seqError } = await client.rpc(
        'allocate_bill_no',
        {
          p_association_id: associationId,
          p_bill_type: typePrefix,
          p_period: period,
        },
      );
      if (seqError || !billNo) {
        await logAuditEvent({
          associationId,
          action: 'bills.generation.failed',
          entityType: 'bill',
          summary: `Failed to allocate bill number for ${typePrefix} in period ${period}: ${seqError?.message ?? 'no bill number returned'}`,
        });
        return false;
      }

      const baseTotal = roundToTwoDecimals(
        items.reduce((sum, li) => sum + li.amount, 0),
      );

      // Compute GST on taxable line items when the association is GST-registered.
      let gstAmount: number | null = null;
      if (gstEnabled && gstRate > 0) {
        const taxableBase = items
          .filter((li) => li.gst_applicable)
          .reduce((sum, li) => sum + li.amount, 0);
        if (taxableBase > 0) {
          gstAmount = roundToTwoDecimals((taxableBase * gstRate) / 100);
        }
      }

      const totalAmount = roundToTwoDecimals(baseTotal + (gstAmount ?? 0));

      const billCategory =
        typePrefix === 'ELT'
          ? 'electricity'
          : typePrefix === 'OTH'
            ? 'other_charges'
            : 'maintenance';

      const { error: rpcError } = await client.rpc('create_bill_with_items', {
        p_association_id: associationId,
        p_unit_id: unit.id,
        p_period: period,
        p_bill_no: billNo,
        p_due_date: dueDate,
        p_total_amount: totalAmount,
        p_line_items: items,
        p_bill_type: billCategory,
        p_gst_amount: gstAmount,
      });

      if (rpcError) {
        console.error(
          `Error generating ${type} bill for unit ${unit.id}:`,
          rpcError,
        );
        await logAuditEvent({
          associationId,
          action: 'bills.generation.failed',
          entityType: 'bill',
          summary: `Failed to generate ${type} bill for period ${period} (unit ${unit.id}): ${rpcError.message}`,
        });
        return false;
      }

      created += 1;
      return true;
    };

    // Common area units only get electricity bills.
    if (unit.type === 'Common Area') {
      if (!hasElec && shouldGenElec) {
        const ok = await generateSpecificBill(
          'Electricity',
          'ELT',
          elecItems,
          elecDueDate,
        );
        if (!ok)
          return {
            success: false,
            error: 'Failed to generate electricity bill',
          };
      }
    } else {
      if (!hasElec && shouldGenElec) {
        const ok = await generateSpecificBill(
          'Electricity',
          'ELT',
          elecItems,
          elecDueDate,
        );
        if (!ok)
          return {
            success: false,
            error: 'Failed to generate electricity bill',
          };
      }
      if (!hasMaint && shouldGenMaint) {
        const ok = await generateSpecificBill(
          'Maintenance',
          'MNT',
          maintItems,
          maintDueDate,
        );
        if (!ok)
          return {
            success: false,
            error: 'Failed to generate maintenance bill',
          };
      }
      if (!hasOther && shouldGenOther) {
        const ok = await generateSpecificBill(
          'Other Charges',
          'OTH',
          otherItems,
          otherDueDate,
        );
        if (!ok)
          return {
            success: false,
            error: 'Failed to generate other charges bill',
          };
      }
    }
  }

  if (created > 0) {
    const monthName = new Date(`${period}-01T00:00:00`).toLocaleString(
      'en-IN',
      { month: 'long' },
    );
    const [periodYear] = period.split('-');
    await logAuditEvent({
      associationId,
      action: 'bills.generated',
      entityType: 'bill',
      summary: `Generated ${created} bill${created === 1 ? '' : 's'} for ${monthName} ${periodYear}`,
    });
  }

  revalidatePath(BILLING_PATH, 'page');

  return { success: true, created, skipped };
}

export interface PendingOtherCharge {
  id: string;
  unit_id: string | null;
  label: string;
  amount: number;
  split_mode: string | null;
}

export async function addOtherChargeToUnitAction(
  associationId: string,
  input: { unit_id: string; period: string; label: string; amount: number },
): Promise<ActionResult> {
  const roleError = await requireBillingAccess(associationId);
  if (roleError) return { success: false, error: roleError };

  if (!input.label.trim())
    return { success: false, error: 'Label is required.' };
  if (input.amount <= 0)
    return { success: false, error: 'Amount must be positive.' };

  const client = getSupabaseServerClient();

  const { data: unit, error: unitError } = await client
    .from('units')
    .select('id')
    .eq('id', input.unit_id)
    .eq('association_id', associationId)
    .single();

  if (unitError || !unit) {
    return { success: false, error: 'Unit not found in this association.' };
  }

  const { error } = await client.from('pending_other_charges').insert({
    association_id: associationId,
    unit_id: input.unit_id,
    period: input.period,
    label: input.label.trim(),
    amount: input.amount,
    split_mode: null,
  });

  if (error) return { success: false, error: error.message };
  revalidatePath(BILLING_PATH, 'page');
  return { success: true };
}

export async function bulkAddOtherChargeAction(
  associationId: string,
  input: {
    period: string;
    label: string;
    amount: number;
    split_mode: 'flat' | 'per_sqft';
  },
): Promise<ActionResult> {
  const roleError = await requireBillingAccess(associationId);
  if (roleError) return { success: false, error: roleError };

  if (!input.label.trim())
    return { success: false, error: 'Label is required.' };
  if (input.amount <= 0)
    return { success: false, error: 'Amount must be positive.' };

  const client = getSupabaseServerClient();
  const { error } = await client.from('pending_other_charges').insert({
    association_id: associationId,
    unit_id: null,
    period: input.period,
    label: input.label.trim(),
    amount: input.amount,
    split_mode: input.split_mode,
  });

  if (error) return { success: false, error: error.message };
  revalidatePath(BILLING_PATH, 'page');
  return { success: true };
}

export async function removePendingOtherChargeAction(
  associationId: string,
  chargeId: string,
): Promise<ActionResult> {
  const roleError = await requireBillingAccess(associationId);
  if (roleError) return { success: false, error: roleError };

  const client = getSupabaseServerClient();
  const { error } = await client
    .from('pending_other_charges')
    .delete()
    .eq('id', chargeId)
    .eq('association_id', associationId);

  if (error) return { success: false, error: error.message };
  revalidatePath(BILLING_PATH, 'page');
  return { success: true };
}

export interface OtherChargeImportRow {
  unit_no: string;
  label: string;
  amount: number;
}

export interface OtherChargeImportResult {
  success: boolean;
  imported: number;
  skipped: string[];
  error?: string;
}

export async function bulkImportOtherChargesAction(
  associationId: string,
  period: string,
  rows: OtherChargeImportRow[],
): Promise<OtherChargeImportResult> {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return {
      success: false,
      imported: 0,
      skipped: [],
      error: 'Invalid period format. Expected YYYY-MM.',
    };
  }

  const roleError = await requireBillingAccess(associationId);
  if (roleError) {
    return { success: false, imported: 0, skipped: [], error: roleError };
  }

  const client = getSupabaseServerClient();

  const { data: units } = await client
    .from('units')
    .select('id, unit_no')
    .eq('association_id', associationId);

  const unitByNo = new Map<string, string>(
    (units ?? []).map((u) => [u.unit_no.toLowerCase().trim(), u.id]),
  );

  const skipped: string[] = [];
  const toInsert = [];

  for (const row of rows) {
    const unitNoNorm = row.unit_no.toLowerCase().trim();
    const unitId = unitByNo.get(unitNoNorm);

    if (!unitId) {
      skipped.push(`Unit "${row.unit_no}" not found`);
      continue;
    }

    if (!row.label.trim()) {
      skipped.push(`Row for Unit "${row.unit_no}" has empty label`);
      continue;
    }

    if (row.amount <= 0) {
      skipped.push(
        `Row for Unit "${row.unit_no}" has invalid amount: ${row.amount}`,
      );
      continue;
    }

    toInsert.push({
      association_id: associationId,
      unit_id: unitId,
      period,
      label: row.label.trim(),
      amount: row.amount,
      split_mode: null,
    });
  }

  if (toInsert.length > 0) {
    const { error } = await client
      .from('pending_other_charges')
      .insert(toInsert);
    if (error) {
      return { success: false, imported: 0, skipped, error: error.message };
    }
  }

  revalidatePath(BILLING_PATH, 'page');
  return { success: true, imported: toInsert.length, skipped };
}
