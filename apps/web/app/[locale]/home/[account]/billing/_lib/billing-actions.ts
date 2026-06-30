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

/**
 * Generate bills for every unit in the association for a billing period,
 * from the association's active charge types (respecting per-unit
 * overrides). Units that already have a bill for this period are skipped —
 * re-running for the same period only fills in the gaps.
 *
 * Electricity line items are only included if a Electricity bill exists for the
 * period; the rate used is the simple invoice ÷ block-units rate (no
 * carry-forward reconciliation yet, same provisional model used on the
 * Electricity page).
 */
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

  const { period } = parsed.data;
  const client = getSupabaseServerClient();

  const { data: units } = await client
    .from('units')
    .select('id, unit_no, area_sqft')
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
    .select('due_day_of_month')
    .eq('association_id', associationId)
    .single();

  const dueDayOfMonth = billingSettings?.due_day_of_month ?? 10;
  const dueDate = `${period}-${String(dueDayOfMonth).padStart(2, '0')}`;

  // Fetch the other_charges charge type only if it is active.
  const otherChargesCT = activeChargeTypes.find(
    (c) => c.key === 'other_charges',
  );

  // Load all pending other charges for this period if other_charges is active.
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

  const alreadyBilledUnitIds = new Set(
    (existingBills ?? []).map((b) => b.unit_id),
  );

  // Derive seq from the highest bill number already used for this period
  // (not the count) so deleted bills don't cause collisions on regeneration.
  let seq = 0;
  for (const b of existingBills ?? []) {
    const match = b.bill_no.match(/-(\d+)$/);
    if (match) seq = Math.max(seq, parseInt(match[1]!, 10));
  }
  let created = 0;
  const skipped = unitRows.filter((u) => alreadyBilledUnitIds.has(u.id)).length;

  const roundToTwoDecimals = (val: number) => Math.round(val * 100) / 100;

  for (const unit of unitRows) {
    if (alreadyBilledUnitIds.has(unit.id)) {
      continue;
    }

    const lineItems: {
      charge_type_id: string;
      description: string;
      payer: string;
      gst_applicable: boolean;
      amount: number;
    }[] = [];

    for (const chargeType of activeChargeTypes) {
      const override = overrideByKey.get(`${unit.id}:${chargeType.id}`);

      if (override?.is_excluded) {
        continue;
      }

      const payer = override?.payer_override ?? chargeType.default_payer;
      let amount: number;

      if (chargeType.calc_method === 'electricity') {
        if (blockRate === null) {
          continue;
        }

        const consumed = consumedByUnit[unit.id] ?? 0;
        amount = consumed * blockRate;
      } else {
        const rate =
          override?.rate_or_amount_override ?? chargeType.rate_or_amount;

        if (rate === null || rate === undefined) {
          continue;
        }

        amount =
          chargeType.calc_method === 'per_sqft' ? rate * unit.area_sqft : rate;
      }

      lineItems.push({
        charge_type_id: chargeType.id,
        description: chargeType.name,
        payer,
        gst_applicable: chargeType.gst_applicable,
        amount: roundToTwoDecimals(amount),
      });
    }

    // Append staged other charges for this unit.
    if (otherChargesCT) {
      for (const pc of pendingRows) {
        if (pc.unit_id !== null && pc.unit_id !== unit.id) continue;

        let pcAmount: number;
        if (pc.unit_id === null) {
          // Bulk charge: split_mode determines per-unit amount
          pcAmount =
            pc.split_mode === 'per_sqft'
              ? roundToTwoDecimals(pc.amount * unit.area_sqft)
              : roundToTwoDecimals(pc.amount);
        } else {
          pcAmount = roundToTwoDecimals(pc.amount);
        }

        lineItems.push({
          charge_type_id: otherChargesCT.id,
          description: pc.label,
          payer: otherChargesCT.default_payer ?? 'Owner',
          gst_applicable: otherChargesCT.gst_applicable ?? false,
          amount: pcAmount,
        });
      }
    }

    if (lineItems.length === 0) {
      continue;
    }

    seq += 1;
    const billNo = `${period}-${String(seq).padStart(3, '0')}`;
    const totalAmount = roundToTwoDecimals(
      lineItems.reduce((sum, li) => sum + li.amount, 0),
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
        p_line_items: lineItems,
      },
    );

    if (rpcError) {
      return {
        success: false,
        error: rpcError.message,
      };
    }

    created += 1;
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
      summary: `${monthName} bills generated — ${created} units`,
    });
  }

  revalidatePath(BILLING_PATH, 'page');

  return { success: true, created, skipped };
}

/**
 * Void (delete) a bill. Admin-only — cascades to its line items.
 */
export async function deleteBillAction(
  billId: string,
  associationId: string,
): Promise<ActionResult> {
  const role = await getAssociationRole(associationId);

  if (role !== 'assoc_admin') {
    return { success: false, error: 'Only an association admin can do that.' };
  }

  const client = getSupabaseServerClient();

  const { data: bill } = await client
    .from('bills')
    .select('bill_no')
    .eq('id', billId)
    .maybeSingle();

  const { error } = await client.from('bills').delete().eq('id', billId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAuditEvent({
    associationId,
    action: 'bill.voided',
    entityType: 'bill',
    entityId: billId,
    summary: `Voided bill ${bill?.bill_no ?? billId}`,
  });

  revalidatePath(BILLING_PATH, 'page');

  return { success: true };
}

export interface PendingOtherCharge {
  id: string;
  unit_id: string | null;
  label: string;
  amount: number;
  split_mode: string | null;
}

/**
 * Stage an other charge for a single unit before bill generation.
 */
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

  // Verify the unit belongs to this association before staging the charge.
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

/**
 * Stage an other charge for ALL units in the association before bill generation.
 * split_mode='flat' → each unit gets `amount`
 * split_mode='per_sqft' → each unit gets `amount * unit.area_sqft`
 */
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

/**
 * Remove a staged other charge (only before bill generation).
 */
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
