'use server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { logAuditEvent } from '~/lib/audit-log';
import { getAssociationRole } from '~/lib/rbac';

import {
  type CreateMescomBillInput,
  CreateElectricityBillSchema,
  type CreateSubMeterInput,
  CreateSubMeterSchema,
  type RecordMeterReadingsInput,
  RecordMeterReadingsSchema,
} from './electricity-schema';

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

  await logAuditEvent({
    associationId,
    action: 'sub_meter.created',
    entityType: 'sub_meter',
    summary: `Added sub-meter ${parsed.data.meterLabel}`,
  });

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

  await logAuditEvent({
    associationId,
    action: isActive ? 'sub_meter.activated' : 'sub_meter.deactivated',
    entityType: 'sub_meter',
    entityId: subMeterId,
    summary: isActive ? 'Reactivated a sub-meter' : 'Deactivated a sub-meter',
  });

  return { success: true };
}

/**
 * Upload a Electricity bill for a billing period. Admin-only — mirrors
 * `admin_insert` on `mescom_bills`.
 */
export async function createElectricityBillAction(
  associationId: string,
  input: CreateMescomBillInput,
): Promise<ActionResult> {
  const roleError = await requireAssocAdmin(associationId);

  if (roleError) {
    return { success: false, error: roleError };
  }

  const parsed = CreateElectricityBillSchema.safeParse(input);

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
    period_start: parsed.data.periodStart ?? null,
    period_end: parsed.data.periodEnd ?? null,
  });

  if (error) {
    if (error.code === '23505') {
      return {
        success: false,
        error: `A bill for ${parsed.data.period} already exists.`,
      };
    }
    await logAuditEvent({
      associationId,
      action: 'mescom_bill.create.failed',
      entityType: 'mescom_bill',
      summary: `Failed to create electricity bill for ${parsed.data.period}: ${error.message}`,
    });
    return { success: false, error: error.message };
  }

  await logAuditEvent({
    associationId,
    action: 'mescom_bill.created',
    entityType: 'mescom_bill',
    summary: `Added electricity bill for ${parsed.data.period}`,
  });

  return { success: true };
}

/**
 * Delete a Electricity bill. Super-admin only — mirrors the delete-unit
 * restriction, since removing a bill also drops its meter readings.
 */
export async function deleteElectricityBillAction(
  associationId: string,
  electricityBillId: string,
): Promise<ActionResult> {
  const client = getSupabaseServerClient();
  const { data: isSuperAdmin } = await client.rpc('is_super_admin');

  if (!isSuperAdmin) {
    return {
      success: false,
      error: 'Only a super admin can delete electricity bills.',
    };
  }

  const { error } = await client
    .from('mescom_bills')
    .delete()
    .eq('id', electricityBillId)
    .eq('association_id', associationId);

  if (error) {
    await logAuditEvent({
      associationId,
      action: 'mescom_bill.delete.failed',
      entityType: 'mescom_bill',
      entityId: electricityBillId,
      summary: `Failed to delete electricity bill: ${error.message}`,
    });
    return { success: false, error: error.message };
  }

  await logAuditEvent({
    associationId,
    action: 'mescom_bill.deleted',
    entityType: 'mescom_bill',
    summary: `Deleted electricity bill`,
  });

  return { success: true };
}

export type MeterReadingImportRow = {
  unit_no: string;
  sub_meter_no: string;
  current_reading: number;
  period: string; // YYYY-MM, validated client-side
};

export type MeterReadingImportSkipped = {
  row: number;
  sub_meter_no: string;
  reason: string;
};

export type MeterReadingImportResult = {
  success: boolean;
  imported: number;
  skipped: MeterReadingImportSkipped[];
  error?: string;
};

/**
 * Bulk-import meter readings from CSV. Each row is matched to a sub_meter by
 * (unit_no + meter_label). For CommonArea meters the unit_no column is ignored
 * and the match falls back to meter_label only. The mescom_bill for the row's
 * period must already exist; rows that don't match a bill or a sub_meter are
 * collected in `skipped`.
 */
export async function bulkImportMeterReadingsAction(
  associationId: string,
  rows: MeterReadingImportRow[],
): Promise<MeterReadingImportResult> {
  const roleError = await requireAssocAdmin(associationId);

  if (roleError) {
    return { success: false, imported: 0, skipped: [], error: roleError };
  }

  const client = getSupabaseServerClient();

  // Fetch all units for this association (for unit_no → id lookup)
  const { data: units } = await client
    .from('units')
    .select('id, unit_no')
    .eq('association_id', associationId);

  const unitByNo = new Map<string, string>(
    (units ?? []).map((u) => [u.unit_no.toLowerCase(), u.id]),
  );

  // Fetch all active sub_meters linked to these units
  const unitIds = (units ?? []).map((u) => u.id);

  const { data: subMeters } = unitIds.length
    ? await client
        .from('sub_meters')
        .select('id, meter_label, meter_type, unit_id')
        .in('unit_id', unitIds)
        .eq('is_active', true)
    : { data: [] };

  const smList = subMeters ?? [];

  // Fetch all bills for this association (period → bill lookup)
  const { data: bills } = await client
    .from('mescom_bills')
    .select('id, period')
    .eq('association_id', associationId);

  const billByPeriod = new Map<string, string>(
    (bills ?? []).map((b) => [b.period, b.id]),
  );

  // Fetch last known reading per sub_meter (to carry forward as previous)
  const smIds = smList.map((s) => s.id);
  const { data: lastReadings } = smIds.length
    ? await client
        .from('meter_readings')
        .select('sub_meter_id, period, current_reading, minimum_charge')
        .in('sub_meter_id', smIds)
        .order('period', { ascending: false })
    : { data: [] };

  // For each sub_meter, group readings by sub_meter_id, sorted desc — first entry is the latest
  const lastReadingBySm = new Map<
    string,
    { period: string; current_reading: number; minimum_charge: number }[]
  >();
  for (const r of lastReadings ?? []) {
    if (!lastReadingBySm.has(r.sub_meter_id)) {
      lastReadingBySm.set(r.sub_meter_id, []);
    }
    lastReadingBySm.get(r.sub_meter_id)!.push({
      period: r.period,
      current_reading: r.current_reading,
      minimum_charge: r.minimum_charge ?? 0,
    });
  }

  const skipped: MeterReadingImportSkipped[] = [];

  // Resolve valid rows first, then upsert in one batch call.
  type UpsertRow = {
    sub_meter_id: string;
    mescom_bill_id: string;
    period: string;
    previous_reading: number;
    current_reading: number;
    minimum_charge?: number;
  };
  const toUpsert: UpsertRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNum = i + 1;

    // Resolve bill
    const billId = billByPeriod.get(row.period);
    if (!billId) {
      skipped.push({
        row: rowNum,
        sub_meter_no: row.sub_meter_no,
        reason: `No bill found for period ${row.period}. Add the bill first.`,
      });
      continue;
    }

    // Resolve sub_meter
    const labelLower = row.sub_meter_no.toLowerCase();
    let subMeter = smList.find(
      (s) =>
        s.meter_label.toLowerCase() === labelLower &&
        s.unit_id === unitByNo.get(row.unit_no.toLowerCase()),
    );

    // Fallback: CommonArea meters — match by label only
    if (!subMeter) {
      const candidates = smList.filter(
        (s) =>
          s.meter_label.toLowerCase() === labelLower &&
          s.meter_type === 'CommonArea',
      );
      if (candidates.length === 1) {
        subMeter = candidates[0];
      } else if (candidates.length > 1) {
        skipped.push({
          row: rowNum,
          sub_meter_no: row.sub_meter_no,
          reason: `Multiple common-area meters with label "${row.sub_meter_no}" found. Specify unit_no to disambiguate.`,
        });
        continue;
      }
    }

    if (!subMeter) {
      skipped.push({
        row: rowNum,
        sub_meter_no: row.sub_meter_no,
        reason: `Sub-meter "${row.sub_meter_no}" not found or not active for unit "${row.unit_no}".`,
      });
      continue;
    }

    // Determine previous reading: latest current_reading strictly before this period
    const prevReadings = (lastReadingBySm.get(subMeter.id) ?? []).filter(
      (r) => r.period < row.period,
    );
    const previousReading =
      prevReadings.length > 0 ? prevReadings[0]!.current_reading : 0;
    const previousMinimumCharge =
      prevReadings.length > 0 ? prevReadings[0]!.minimum_charge : 0;

    toUpsert.push({
      sub_meter_id: subMeter.id,
      mescom_bill_id: billId,
      period: row.period,
      previous_reading: previousReading,
      current_reading: row.current_reading,
      minimum_charge: previousMinimumCharge,
    });
  }

  let imported = 0;

  if (toUpsert.length > 0) {
    const { error } = await client
      .from('meter_readings')
      .upsert(toUpsert, { onConflict: 'mescom_bill_id,sub_meter_id' });

    if (error) {
      await logAuditEvent({
        associationId,
        action: 'meter_readings.bulk_import.failed',
        entityType: 'mescom_bill',
        summary: `Failed to bulk import meter readings: ${error.message}`,
      });
      return { success: false, error: error.message, imported: 0, skipped };
    }

    imported = toUpsert.length;
  }

  if (imported > 0) {
    const periods = [...new Set(rows.map((r) => r.period))].join(', ');
    await logAuditEvent({
      associationId,
      action: 'meter_readings.bulk_imported',
      entityType: 'mescom_bill',
      entityId: associationId,
      summary: `Bulk imported ${imported} meter reading(s) via CSV for ${periods}`,
    });
  }

  return { success: true, imported, skipped };
}

/**
 * Record (or update) meter readings for a Electricity bill. There's no DB
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
    .eq('id', parsed.data.electricityBillId)
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
          minimum_charge: reading.minimumCharge,
        })
        .eq('id', existingId);

      if (error) {
        await logAuditEvent({
          associationId,
          action: 'meter_readings.record.failed',
          entityType: 'mescom_bill',
          entityId: bill.id,
          summary: `Failed to record meter readings for ${bill.period}: ${error.message}`,
        });
        return { success: false, error: error.message };
      }
    } else {
      const { error } = await client.from('meter_readings').insert({
        sub_meter_id: reading.subMeterId,
        mescom_bill_id: bill.id,
        period: bill.period,
        previous_reading: reading.previousReading,
        current_reading: reading.currentReading,
        minimum_charge: reading.minimumCharge,
      });

      if (error) {
        await logAuditEvent({
          associationId,
          action: 'meter_readings.record.failed',
          entityType: 'mescom_bill',
          entityId: bill.id,
          summary: `Failed to record meter readings for ${bill.period}: ${error.message}`,
        });
        return { success: false, error: error.message };
      }
    }
  }

  await logAuditEvent({
    associationId,
    action: 'meter_readings.recorded',
    entityType: 'mescom_bill',
    entityId: bill.id,
    summary: `Recorded meter readings for ${bill.period}`,
  });

  return { success: true };
}
