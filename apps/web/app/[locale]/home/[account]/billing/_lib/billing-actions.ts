'use server';

import { revalidatePath } from 'next/cache';

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

  // `associationId` is `associations.id`, not `accounts.id` — the slug lives
  // on the linked account, so resolve it through `associations.account_id`.
  const { data: association, error: associationError } = await client
    .from('associations')
    .select('accounts(slug)')
    .eq('id', associationId)
    .single();

  const accountSlug = association?.accounts?.slug;

  if (associationError || !accountSlug) {
    return {
      success: false,
      error: 'Association slug is required to generate bills.',
    };
  }

  const slugPart = accountSlug.substring(0, 3).toUpperCase();
  const uuidPart = associationId.substring(0, 4).toUpperCase();
  const prefix = `${slugPart}${uuidPart}`;
  const calculateDueDate = (day: number) =>
    `${period}-${String(day).padStart(2, '0')}`;
  const elecDueDate = calculateDueDate(
    billingSettings?.electricity_due_day ?? 10,
  );
  const maintDueDate = calculateDueDate(
    billingSettings?.maintenance_due_day ?? 10,
  );
  const otherDueDate = calculateDueDate(
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

  if (hasElectricityChargeType) {
    const { data: mescomBill } = await client
      .from('mescom_bills')
      .select('invoice_amount, block_consumption_units')
      .eq('association_id', associationId)
      .eq('period', period)
      .maybeSingle();

    if (mescomBill && mescomBill.block_consumption_units > 0) {
      blockRate =
        mescomBill.invoice_amount / mescomBill.block_consumption_units;

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
          .select('sub_meter_id, consumed_units')
          .eq('period', period)
          .in('sub_meter_id', subMeterIds);

        for (const r of readings ?? []) {
          const unitId = unitIdBySubMeter.get(r.sub_meter_id);

          if (unitId) {
            consumedByUnit[unitId] =
              (consumedByUnit[unitId] ?? 0) + (r.consumed_units ?? 0);
          }
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
  let nextSeq = 0;
  for (const b of existingBills ?? []) {
    const list = existingByUnit.get(b.unit_id) || [];
    list.push(b.bill_no);
    existingByUnit.set(b.unit_id, list);

    const match = b.bill_no.match(/-(\d+)$/);
    if (match) nextSeq = Math.max(nextSeq, parseInt(match[1]!, 10));
  }

  let created = 0;
  let skipped = 0;

  const roundToTwoDecimals = (val: number) => Math.round(val * 100) / 100;

  const yyMM = period.replace('-', '').substring(2); // "2026-06" -> "2606"

  const shouldGenElec = billType === 'All' || billType === 'Electricity';
  const shouldGenMaint = billType === 'All' || billType === 'Maintenance';
  const shouldGenOther = billType === 'All' || billType === 'Other Charges';

  for (const unit of unitRows) {
    const existing = existingByUnit.get(unit.id) || [];
    const hasElec = existing.some((b: string) => b.includes('-ELEC-'));
    const hasMaint = existing.some((b: string) => b.includes('-MANT-'));
    const hasOther = existing.some((b: string) => b.includes('-OTHR-'));

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
        amount = consumed * blockRate;

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
          pcAmount =
            pc.split_mode === 'per_sqft'
              ? roundToTwoDecimals(pc.amount * unit.area_sqft)
              : roundToTwoDecimals(pc.amount);
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

      nextSeq += 1;
      const billNo = `${prefix}-${typePrefix}-${yyMM}-${String(nextSeq).padStart(3, '0')}`;
      const totalAmount = roundToTwoDecimals(
        items.reduce((sum, li) => sum + li.amount, 0),
      );

      const { error: rpcError } = await client.rpc(
        'create_bill_with_items' as any,
        {
          p_association_id: associationId,
          p_unit_id: unit.id,
          p_period: period,
          p_bill_no: billNo,
          p_due_date: dueDate,
          p_total_amount: totalAmount,
          p_line_items: items,
        },
      );

      if (rpcError) {
        console.error(
          `Error generating ${type} bill for unit ${unit.id}:`,
          rpcError,
        );
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
          'ELEC',
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
          'ELEC',
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
          'MANT',
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
          'OTHR',
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
    await logAuditEvent({
      associationId,
      action: 'bills.generated',
      entityType: 'bill',
      summary: `${monthName} separate bills generated — ${created} invoices`,
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
