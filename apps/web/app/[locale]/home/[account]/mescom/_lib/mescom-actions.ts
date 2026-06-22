'use server';

import { revalidatePath } from 'next/cache';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { getAssociationRole } from '~/lib/rbac';

import {
  type CreateMescomBillInput,
  CreateMescomBillSchema,
  type CreateSubMeterInput,
  CreateSubMeterSchema,
  type RecordMeterReadingsInput,
  RecordMeterReadingsSchema,
} from './mescom-schema';

const MESCOM_PATH = '/home/[account]/mescom';

type ActionResult = { success: boolean; error?: string };

async function requireAssocAdmin(
  associationId: string,
): Promise<string | null> {
  const role = await getAssociationRole(associationId);

  if (role !== 'assoc_admin') {
    return 'Only an association admin can do that.';
  }

  return null;
}

/**
 * Add a sub-meter to a unit (or a common-area meter). Admin-only — mirrors
 * `admin_insert` on `sub_meters`.
 */
export async function createSubMeterAction(
  associationId: string,
  input: CreateSubMeterInput,
): Promise<ActionResult> {
  const roleError = await requireAssocAdmin(associationId);

  if (roleError) {
    return { success: false, error: roleError };
  }

  const parsed = CreateSubMeterSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Please check the form.',
    };
  }

  const client = getSupabaseServerClient();

  // Defense-in-depth: confirm the unit actually belongs to this association
  // before inserting — RLS would reject it anyway, but this gives a friendly
  // message instead of a raw policy violation.
  const { data: unit } = await client
    .from('units')
    .select('id')
    .eq('id', parsed.data.unitId)
    .eq('association_id', associationId)
    .maybeSingle();

  if (!unit) {
    return { success: false, error: 'That unit was not found.' };
  }

  const { error } = await client.from('sub_meters').insert({
    unit_id: parsed.data.unitId,
    meter_label: parsed.data.meterLabel,
    meter_type: parsed.data.meterType,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(MESCOM_PATH, 'page');

  return { success: true };
}

/**
 * Toggle a sub-meter's active flag. We deactivate rather than delete so past
 * meter readings stay attached to a meaningful label.
 */
export async function setSubMeterActiveAction(
  subMeterId: string,
  associationId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const roleError = await requireAssocAdmin(associationId);

  if (roleError) {
    return { success: false, error: roleError };
  }

  const client = getSupabaseServerClient();

  const { error } = await client
    .from('sub_meters')
    .update({ is_active: isActive })
    .eq('id', subMeterId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(MESCOM_PATH, 'page');

  return { success: true };
}

/**
 * Upload a MESCOM bill for a billing period. Admin-only — mirrors
 * `admin_insert` on `mescom_bills`.
 */
export async function createMescomBillAction(
  associationId: string,
  input: CreateMescomBillInput,
): Promise<ActionResult> {
  const roleError = await requireAssocAdmin(associationId);

  if (roleError) {
    return { success: false, error: roleError };
  }

  const parsed = CreateMescomBillSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Please check the form.',
    };
  }

  const client = getSupabaseServerClient();

  const { error } = await client.from('mescom_bills').insert({
    association_id: associationId,
    period: parsed.data.period,
    invoice_amount: parsed.data.invoiceAmount,
    block_consumption_units: parsed.data.blockConsumptionUnits,
  });

  if (error) {
    if (error.code === '23505') {
      return {
        success: false,
        error: `A bill for ${parsed.data.period} already exists.`,
      };
    }

    return { success: false, error: error.message };
  }

  revalidatePath(MESCOM_PATH, 'page');

  return { success: true };
}

/**
 * Record (or update) meter readings for a MESCOM bill. There's no DB
 * constraint enforcing one reading per (sub_meter, bill) pair, so we check
 * for an existing row ourselves and update it instead of inserting a
 * duplicate.
 */
export async function recordMeterReadingsAction(
  associationId: string,
  input: RecordMeterReadingsInput,
): Promise<ActionResult> {
  const roleError = await requireAssocAdmin(associationId);

  if (roleError) {
    return { success: false, error: roleError };
  }

  const parsed = RecordMeterReadingsSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Please check the form.',
    };
  }

  const client = getSupabaseServerClient();

  const { data: bill } = await client
    .from('mescom_bills')
    .select('id, period')
    .eq('id', parsed.data.mescomBillId)
    .eq('association_id', associationId)
    .maybeSingle();

  if (!bill) {
    return { success: false, error: 'That bill was not found.' };
  }

  const { data: existingReadings } = await client
    .from('meter_readings')
    .select('id, sub_meter_id')
    .eq('mescom_bill_id', bill.id);

  const existingBySubMeter = new Map(
    (existingReadings ?? []).map((r) => [r.sub_meter_id, r.id]),
  );

  for (const reading of parsed.data.readings) {
    const existingId = existingBySubMeter.get(reading.subMeterId);

    if (existingId) {
      const { error } = await client
        .from('meter_readings')
        .update({
          previous_reading: reading.previousReading,
          current_reading: reading.currentReading,
        })
        .eq('id', existingId);

      if (error) {
        return { success: false, error: error.message };
      }
    } else {
      const { error } = await client.from('meter_readings').insert({
        sub_meter_id: reading.subMeterId,
        mescom_bill_id: bill.id,
        period: bill.period,
        previous_reading: reading.previousReading,
        current_reading: reading.currentReading,
      });

      if (error) {
        return { success: false, error: error.message };
      }
    }
  }

  revalidatePath(MESCOM_PATH, 'page');

  return { success: true };
}
