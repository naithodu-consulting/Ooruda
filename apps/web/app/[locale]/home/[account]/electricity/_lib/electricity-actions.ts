'use server';

import 'server-only';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
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
    load_kva: parsed.data.loadKva ?? null,
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
  sub_meter_no: string;
  current_reading: number;
  period: string; // YYYY-MM, validated client-side
  // Optional per-reading overrides; blank in CSV means "preserve existing value"
  load_kva?: number | null;
  minimum_charge?: number | null;
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
const PERIOD_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_IMPORT_ROWS = 500;

export async function bulkImportMeterReadingsAction(
  associationId: string,
  rows: MeterReadingImportRow[],
): Promise<MeterReadingImportResult> {
  const roleError = await requireAssocAdmin(associationId);

  if (roleError) {
    return { success: false, imported: 0, skipped: [], error: roleError };
  }

  if (rows.length === 0 || rows.length > MAX_IMPORT_ROWS) {
    return {
      success: false,
      imported: 0,
      skipped: [],
      error: `Row count must be between 1 and ${MAX_IMPORT_ROWS}.`,
    };
  }

  const firstPeriod = rows[0]!.period;
  if (
    !PERIOD_REGEX.test(firstPeriod) ||
    rows.some((r) => r.period !== firstPeriod)
  ) {
    return {
      success: false,
      imported: 0,
      skipped: [],
      error: 'Invalid or inconsistent period format (expected YYYY-MM).',
    };
  }

  const client = getSupabaseServerClient();

  // Fetch all units for this association
  const { data: units } = await client
    .from('units')
    .select('id')
    .eq('association_id', associationId);

  const unitIds = (units ?? []).map((u) => u.id);

  // Fetch all active sub_meters for this association. load_kva and minimum_charge
  // here are defaults: used only when the readings CSV leaves those fields blank.
  const { data: subMeters } = unitIds.length
    ? await client
        .from('sub_meters')
        .select('id, meter_label, initial_reading, minimum_charge, load_kva')
        .in('unit_id', unitIds)
        .eq('is_active', true)
    : { data: [] };

  const smList = subMeters ?? [];

  // Build a label → sub_meter map. Labels must be unique within the association.
  const smByLabel = new Map<string, (typeof smList)[number]>();
  const duplicateLabels = new Set<string>();
  for (const sm of smList) {
    const key = sm.meter_label.toLowerCase();
    if (smByLabel.has(key)) {
      duplicateLabels.add(key);
    } else {
      smByLabel.set(key, sm);
    }
  }

  // Fetch all bills for this association (period → bill lookup)
  const { data: bills } = await client
    .from('mescom_bills')
    .select('id, period')
    .eq('association_id', associationId);

  const billByPeriod = new Map<string, string>(
    (bills ?? []).map((b) => [b.period, b.id]),
  );

  // Fetch last known reading per sub_meter (to carry forward previous_reading,
  // minimum_charge, and load_kva when the CSV leaves those fields blank).
  const smIds = smList.map((s) => s.id);
  const { data: lastReadings } = smIds.length
    ? await client
        .from('meter_readings')
        .select(
          'sub_meter_id, period, current_reading, minimum_charge, load_kva',
        )
        .in('sub_meter_id', smIds)
        .lte('period', firstPeriod)
        .order('period', { ascending: false })
    : { data: [] };

  // Group by sub_meter_id; first entry per meter is the most recent
  const lastReadingBySm = new Map<
    string,
    {
      period: string;
      current_reading: number;
      minimum_charge: number | null;
      load_kva: number | null;
    }[]
  >();
  for (const r of lastReadings ?? []) {
    if (!lastReadingBySm.has(r.sub_meter_id)) {
      lastReadingBySm.set(r.sub_meter_id, []);
    }
    lastReadingBySm.get(r.sub_meter_id)!.push({
      period: r.period,
      current_reading: r.current_reading,
      minimum_charge: r.minimum_charge,
      load_kva: r.load_kva,
    });
  }

  // Fetch existing readings for this period's bill so we can preserve
  // load_kva / minimum_charge when the CSV leaves those fields blank.
  const targetBillId = billByPeriod.get(firstPeriod);
  const { data: existingReadings } =
    targetBillId && smIds.length
      ? await client
          .from('meter_readings')
          .select('sub_meter_id, minimum_charge, load_kva')
          .eq('mescom_bill_id', targetBillId)
          .in('sub_meter_id', smIds)
      : { data: [] };

  type ExistingReading = {
    minimum_charge: number | null;
    load_kva: number | null;
  };
  const existingBySmId = new Map<string, ExistingReading>(
    (existingReadings ?? []).map((r) => [
      r.sub_meter_id,
      { minimum_charge: r.minimum_charge, load_kva: r.load_kva },
    ]),
  );

  const skipped: MeterReadingImportSkipped[] = [];

  type UpsertRow = {
    sub_meter_id: string;
    mescom_bill_id: string;
    period: string;
    previous_reading: number;
    current_reading: number;
    minimum_charge: number;
    load_kva: number | null;
  };
  const toUpsert: UpsertRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNum = i + 1;

    // Resolve MESCOM bill for the period
    const billId = billByPeriod.get(row.period);
    if (!billId) {
      skipped.push({
        row: rowNum,
        sub_meter_no: row.sub_meter_no,
        reason: `No MESCOM bill found for ${row.period}. Upload the bill first.`,
      });
      continue;
    }

    // Resolve sub_meter by label (association-wide; labels must be unique)
    const labelLower = row.sub_meter_no.toLowerCase();

    if (duplicateLabels.has(labelLower)) {
      skipped.push({
        row: rowNum,
        sub_meter_no: row.sub_meter_no,
        reason: `Multiple active meters share the label "${row.sub_meter_no}". Fix meter labels before importing.`,
      });
      continue;
    }

    const subMeter = smByLabel.get(labelLower);
    if (!subMeter) {
      skipped.push({
        row: rowNum,
        sub_meter_no: row.sub_meter_no,
        reason: `Sub-meter "${row.sub_meter_no}" not found or not active.`,
      });
      continue;
    }

    // Previous reading: latest recorded reading before this period,
    // falling back to sub_meters.initial_reading for the first-ever bill.
    const prevReadings = (lastReadingBySm.get(subMeter.id) ?? []).filter(
      (r) => r.period < row.period,
    );
    const priorReading = prevReadings[0] ?? null;
    const previousReading =
      priorReading?.current_reading ?? subMeter.initial_reading ?? 0;

    if (row.current_reading < previousReading) {
      skipped.push({
        row: rowNum,
        sub_meter_no: row.sub_meter_no,
        reason: `Current reading (${row.current_reading}) is less than previous reading (${previousReading}). Check for meter replacement.`,
      });
      continue;
    }

    const existing = existingBySmId.get(subMeter.id);

    // Resolution order for load_kva / minimum_charge:
    // 1. CSV value  2. existing reading for this bill  3. most recent prior-period reading  4. sub_meter default  5. 0/null
    const resolvedMinCharge =
      row.minimum_charge != null
        ? row.minimum_charge
        : (existing?.minimum_charge ??
          priorReading?.minimum_charge ??
          subMeter.minimum_charge ??
          0);

    const resolvedLoadKva =
      row.load_kva != null
        ? row.load_kva
        : (existing?.load_kva ??
          priorReading?.load_kva ??
          subMeter.load_kva ??
          null);

    toUpsert.push({
      sub_meter_id: subMeter.id,
      mescom_bill_id: billId,
      period: row.period,
      previous_reading: previousReading,
      current_reading: row.current_reading,
      minimum_charge: resolvedMinCharge,
      load_kva: resolvedLoadKva,
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

// ── Bulk sub-meter import ─────────────────────────────────────────────────────

export type SubMeterImportRow = {
  unit_no: string;
  sub_meter_no: string;
  meter_type: 'Unit' | 'CommonArea';
  initial_reading?: number;
};

export type SubMeterImportSkipped = {
  row: number;
  sub_meter_no: string;
  reason: string;
};

export type SubMeterImportResult = {
  success: boolean;
  imported: number;
  skipped: SubMeterImportSkipped[];
  error?: string;
};

/**
 * Bulk-import sub-meters from CSV. Super-admin only.
 * Existing (unit_id + meter_label) pairs are skipped — no overwrite.
 */
export async function bulkImportSubMetersAction(
  associationId: string,
  rows: SubMeterImportRow[],
): Promise<SubMeterImportResult> {
  const client = getSupabaseServerClient();

  const { data: isSuperAdmin } = await client.rpc('is_super_admin');
  if (!isSuperAdmin) {
    return {
      success: false,
      imported: 0,
      skipped: [],
      error: 'Only a super admin can bulk-import sub-meters.',
    };
  }

  if (rows.length === 0 || rows.length > MAX_IMPORT_ROWS) {
    return {
      success: false,
      imported: 0,
      skipped: [],
      error: `Row count must be between 1 and ${MAX_IMPORT_ROWS}.`,
    };
  }

  const adminClient = getSupabaseServerAdminClient();

  // Use adminClient for both units and existing sub-meters so dedup keys are consistent
  const { data: units } = await adminClient
    .from('units')
    .select('id, unit_no')
    .eq('association_id', associationId)
    .order('unit_no');

  const unitByNo = new Map<string, string>(
    (units ?? []).map((u) => [u.unit_no.toLowerCase(), u.id]),
  );

  // Fetch existing sub-meters to detect duplicates
  const unitIds = (units ?? []).map((u) => u.id);
  const { data: existing } = unitIds.length
    ? await adminClient
        .from('sub_meters')
        .select('unit_id, meter_label')
        .in('unit_id', unitIds)
    : { data: [] };

  const existingSet = new Set(
    (existing ?? []).map((s) => `${s.unit_id}::${s.meter_label.toLowerCase()}`),
  );

  const skipped: SubMeterImportSkipped[] = [];

  type InsertRow = {
    unit_id: string;
    meter_label: string;
    meter_type: string;
    initial_reading: number;
  };
  const toInsert: InsertRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNum = i + 1;

    if (!['Unit', 'CommonArea'].includes(row.meter_type)) {
      skipped.push({
        row: rowNum,
        sub_meter_no: row.sub_meter_no,
        reason: `Invalid meter_type "${row.meter_type}". Must be "Unit" or "CommonArea".`,
      });
      continue;
    }

    const isCommon = row.meter_type === 'CommonArea';
    let unitId: string | undefined;

    if (isCommon) {
      // For CommonArea meters, unit_no is ignored — attach to the first unit as
      // a placeholder so the FK is satisfied; matching during readings uses label only.
      unitId = units?.[0]?.id;
      if (!unitId) {
        skipped.push({
          row: rowNum,
          sub_meter_no: row.sub_meter_no,
          reason: 'No units found in this association.',
        });
        continue;
      }
    } else {
      unitId = unitByNo.get(row.unit_no.toLowerCase());
      if (!unitId) {
        skipped.push({
          row: rowNum,
          sub_meter_no: row.sub_meter_no,
          reason: `Unit "${row.unit_no}" not found.`,
        });
        continue;
      }
    }

    const key = `${unitId}::${row.sub_meter_no.toLowerCase()}`;
    if (existingSet.has(key)) {
      skipped.push({
        row: rowNum,
        sub_meter_no: row.sub_meter_no,
        reason: `Sub-meter "${row.sub_meter_no}" already exists for unit "${row.unit_no}".`,
      });
      continue;
    }

    existingSet.add(key); // prevent duplicates within the same batch
    toInsert.push({
      unit_id: unitId,
      meter_label: row.sub_meter_no,
      meter_type: row.meter_type,
      initial_reading: row.initial_reading ?? 0,
    });
  }

  if (toInsert.length === 0) {
    return { success: true, imported: 0, skipped };
  }

  const { error } = await adminClient.from('sub_meters').insert(toInsert);

  if (error) {
    await logAuditEvent({
      associationId,
      action: 'sub_meter.bulk_import.failed',
      entityType: 'sub_meter',
      summary: `Failed to bulk import sub-meters: ${error.message}`,
    });
    return { success: false, imported: 0, skipped, error: error.message };
  }

  await logAuditEvent({
    associationId,
    action: 'sub_meter.bulk_imported',
    entityType: 'sub_meter',
    summary: `Bulk imported ${toInsert.length} sub-meter(s) via CSV`,
  });

  return { success: true, imported: toInsert.length, skipped };
}
