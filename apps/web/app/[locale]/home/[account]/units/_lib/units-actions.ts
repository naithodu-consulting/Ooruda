'use server';

import { revalidatePath } from 'next/cache';

import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { logAuditEvent } from '~/lib/audit-log';
import { getAssociationRole } from '~/lib/rbac';

import {
  type AssignTenantInput,
  AssignTenantSchema,
  type CreateUnitInput,
  CreateUnitSchema,
  type UpdateUnitInput,
  UpdateUnitSchema,
} from './units-schema';

const UNITS_PATH = '/home/[account]/units';

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
 * Create a unit under an association. Admin-only — mirrors the `admin_insert`
 * RLS policy on `units`. The role check here is defense-in-depth on top of RLS
 * and lets us return a friendly message instead of a raw DB error.
 */
export async function createUnitAction(
  associationId: string,
  input: CreateUnitInput,
): Promise<ActionResult> {
  const roleError = await requireAssocAdmin(associationId);

  if (roleError) {
    return { success: false, error: roleError };
  }

  const parsed = CreateUnitSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Please check the form.',
    };
  }

  const client = getSupabaseServerClient();

  const { data: unit, error } = await client
    .from('units')
    .insert({
      association_id: associationId,
      unit_no: parsed.data.unit_no,
      type: parsed.data.type,
      floor: parsed.data.floor ?? null,
      area_sqft: parsed.data.area_sqft,
      door_no: parsed.data.door_no ?? null,
    })
    .select('id')
    .single();

  if (error) {
    // Unique (association_id, unit_no) violation
    if (error.code === '23505') {
      return {
        success: false,
        error: `Unit "${parsed.data.unit_no}" already exists.`,
      };
    }

    return { success: false, error: error.message };
  }

  await logAuditEvent({
    associationId,
    action: 'unit.created',
    entityType: 'unit',
    entityId: unit.id,
    summary: `Created unit ${parsed.data.unit_no} (${parsed.data.type})`,
  });

  revalidatePath(UNITS_PATH, 'page');

  return { success: true };
}

/**
 * Update a unit's details. Admin-only — mirrors `admin_update` on `units`.
 */
export async function updateUnitAction(
  unitId: string,
  associationId: string,
  input: UpdateUnitInput,
): Promise<ActionResult> {
  const roleError = await requireAssocAdmin(associationId);

  if (roleError) {
    return { success: false, error: roleError };
  }

  const parsed = UpdateUnitSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Please check the form.',
    };
  }

  const client = getSupabaseServerClient();
  const ownerId = parsed.data.owner_id ?? null;

  if (ownerId) {
    const isEligible = await isAssociationMemberWithRoles(
      client,
      associationId,
      ownerId,
      ['assoc_admin', 'prop_owner'],
    );

    if (!isEligible) {
      return {
        success: false,
        error: 'That person is not a member of this association with an owner-eligible role.',
      };
    }
  }

  const { error } = await client
    .from('units')
    .update({
      unit_no: parsed.data.unit_no,
      type: parsed.data.type,
      floor: parsed.data.floor ?? null,
      area_sqft: parsed.data.area_sqft,
      door_no: parsed.data.door_no ?? null,
      owner_id: ownerId,
      bill_to: parsed.data.bill_to ?? 'auto',
      owner_is_company: parsed.data.owner_is_company ?? false,
      owner_company_name: parsed.data.owner_company_name ?? null,
      owner_company_address: parsed.data.owner_company_address ?? null,
      owner_company_gstin: parsed.data.owner_company_gstin ?? null,
    })
    .eq('id', unitId)
    .eq('association_id', associationId);

  if (error) {
    if (error.code === '23505') {
      return {
        success: false,
        error: `Unit "${parsed.data.unit_no}" already exists.`,
      };
    }

    return { success: false, error: error.message };
  }

  await logAuditEvent({
    associationId,
    action: 'unit.updated',
    entityType: 'unit',
    entityId: unitId,
    summary: `Updated details for unit ${parsed.data.unit_no}`,
  });

  revalidatePath(UNITS_PATH, 'page');

  return { success: true };
}

/**
 * Delete a unit. Admin-only — mirrors `admin_delete` on `units`. Cascades to
 * the unit's tenancies, sub-meters, and charge overrides at the DB level.
 */
export async function deleteUnitAction(
  unitId: string,
  associationId: string,
): Promise<ActionResult> {
  const client = getSupabaseServerClient();
  const { data: isSuperAdmin } = await client.rpc('is_super_admin');

  if (!isSuperAdmin) {
    return { success: false, error: 'Only a super admin can delete units.' };
  }

  const { data: unit } = await client
    .from('units')
    .select('unit_no')
    .eq('id', unitId)
    .maybeSingle();

  const { error } = await client
    .from('units')
    .delete()
    .eq('id', unitId)
    .eq('association_id', associationId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAuditEvent({
    associationId,
    action: 'unit.deleted',
    entityType: 'unit',
    entityId: unitId,
    summary: `Deleted unit ${unit?.unit_no ?? unitId}`,
  });

  revalidatePath(UNITS_PATH, 'page');

  return { success: true };
}

/**
 * Assign or unassign a unit's owner. `ownerId: null` clears the owner.
 * Admin-only. The person being assigned must be a member of this association
 * with role `prop_owner` or `assoc_admin` — we don't let an admin point
 * owner_id at an arbitrary user id.
 */
export async function assignOwnerAction(
  unitId: string,
  associationId: string,
  ownerId: string | null,
): Promise<ActionResult> {
  const roleError = await requireAssocAdmin(associationId);

  if (roleError) {
    return { success: false, error: roleError };
  }

  const client = getSupabaseServerClient();

  if (ownerId) {
    const isEligible = await isAssociationMemberWithRoles(
      client,
      associationId,
      ownerId,
      ['assoc_admin', 'prop_owner'],
    );

    if (!isEligible) {
      return {
        success: false,
        error: 'That person is not a member of this association with an owner-eligible role.',
      };
    }
  }

  const { error } = await client
    .from('units')
    .update({ owner_id: ownerId })
    .eq('id', unitId)
    .eq('association_id', associationId);

  if (error) {
    return { success: false, error: error.message };
  }

  const { data: unit } = await client
    .from('units')
    .select('unit_no')
    .eq('id', unitId)
    .single();

  await logAuditEvent({
    associationId,
    action: ownerId ? 'unit.owner_assigned' : 'unit.owner_unassigned',
    entityType: 'unit',
    entityId: unitId,
    summary: ownerId
      ? `Owner assigned to unit ${unit?.unit_no ?? unitId}`
      : `Cleared owner for unit ${unit?.unit_no ?? unitId}`,
  });

  revalidatePath(UNITS_PATH, 'page');

  return { success: true };
}

/**
 * Move a tenant into a unit. The `tenancies_one_active_per_unit` unique index
 * rejects this if the unit already has an active tenancy — end it first.
 */
export async function assignTenantAction(
  unitId: string,
  associationId: string,
  input: AssignTenantInput,
): Promise<ActionResult> {
  const roleError = await requireAssocAdmin(associationId);

  if (roleError) {
    return { success: false, error: roleError };
  }

  const parsed = AssignTenantSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Please check the form.',
    };
  }

  const client = getSupabaseServerClient();

  const isEligible = await isAssociationMemberWithRoles(
    client,
    associationId,
    parsed.data.tenantId,
    ['assoc_admin', 'tenant'],
  );

  if (!isEligible) {
    return {
      success: false,
      error: 'That person is not a member of this association with a tenant-eligible role.',
    };
  }

  const { error: tenancyError } = await client.from('tenancies').insert({
    unit_id: unitId,
    tenant_id: parsed.data.tenantId,
    start_date: parsed.data.startDate,
    is_company: parsed.data.isCompany ?? false,
    company_name: parsed.data.companyName ?? null,
    company_address: parsed.data.companyAddress ?? null,
    company_gstin: parsed.data.companyGstin ?? null,
  });

  if (tenancyError) {
    if (tenancyError.code === '23505') {
      return {
        success: false,
        error:
          'This unit already has an active tenant. End that tenancy first.',
      };
    }

    return { success: false, error: tenancyError.message };
  }

  const { error: statusError } = await client
    .from('units')
    .update({ status: 'Rented' })
    .eq('id', unitId)
    .eq('association_id', associationId);

  if (statusError) {
    return { success: false, error: statusError.message };
  }

  const { data: unit } = await client
    .from('units')
    .select('unit_no')
    .eq('id', unitId)
    .single();

  await logAuditEvent({
    associationId,
    action: 'tenancy.started',
    entityType: 'unit',
    entityId: unitId,
    summary: `New tenant onboarded — Unit ${unit?.unit_no ?? unitId}`,
  });

  revalidatePath(UNITS_PATH, 'page');

  return { success: true };
}

/**
 * End a unit's active tenancy and mark the unit Vacant again.
 */
export async function endTenancyAction(
  tenancyId: string,
  unitId: string,
  associationId: string,
): Promise<ActionResult> {
  const roleError = await requireAssocAdmin(associationId);

  if (roleError) {
    return { success: false, error: roleError };
  }

  const client = getSupabaseServerClient();
  const now = new Date();
  const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const { error: tenancyError } = await client
    .from('tenancies')
    .update({
      end_date: todayLocal,
      status: 'ended',
    })
    .eq('id', tenancyId)
    .eq('unit_id', unitId);

  if (tenancyError) {
    return { success: false, error: tenancyError.message };
  }

  const { error: statusError } = await client
    .from('units')
    .update({ status: 'Self Occupied' })
    .eq('id', unitId)
    .eq('association_id', associationId);

  if (statusError) {
    return { success: false, error: statusError.message };
  }

  const { data: unit } = await client
    .from('units')
    .select('unit_no')
    .eq('id', unitId)
    .single();

  await logAuditEvent({
    associationId,
    action: 'tenancy.ended',
    entityType: 'unit',
    entityId: unitId,
    summary: `Ended tenancy for unit ${unit?.unit_no ?? unitId}`,
  });

  revalidatePath(UNITS_PATH, 'page');

  return { success: true };
}

export type BulkImportRow = {
  unit_no: string;
  type: string;
  floor: string | number | null | undefined;
  area_sqft: string | number;
  door_no?: string | null;
};

export type BulkImportSkipped = {
  row: number;
  unit_no: string;
  reason: string;
};

export type BulkImportResult = {
  success: boolean;
  imported: number;
  skipped: BulkImportSkipped[];
  error?: string;
};

/**
 * Bulk import units from CSV. Each row is validated with CreateUnitSchema.
 * Rows that fail validation or have a duplicate unit_no are skipped and
 * returned in the `skipped` list so the caller can surface them to the user.
 */
export async function bulkImportUnitsAction(
  associationId: string,
  rows: BulkImportRow[],
): Promise<BulkImportResult> {
  const roleError = await requireAssocAdmin(associationId);

  if (roleError) {
    return { success: false, imported: 0, skipped: [], error: roleError };
  }

  const client = getSupabaseServerClient();
  const skipped: BulkImportSkipped[] = [];
  const toInsert: {
    association_id: string;
    unit_no: string;
    type: string;
    floor: number | null;
    area_sqft: number;
    door_no: string | null;
  }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const parsed = CreateUnitSchema.safeParse(row);

    if (!parsed.success) {
      skipped.push({
        row: i + 1,
        unit_no: String(row.unit_no ?? ''),
        reason: parsed.error.issues[0]?.message ?? 'Validation error',
      });
      continue;
    }

    toInsert.push({
      association_id: associationId,
      unit_no: parsed.data.unit_no,
      type: parsed.data.type,
      floor: parsed.data.floor ?? null,
      area_sqft: parsed.data.area_sqft,
      door_no: parsed.data.door_no ?? null,
    });
  }

  if (toInsert.length === 0) {
    return { success: true, imported: 0, skipped };
  }

  const { data: inserted, error } = await client
    .from('units')
    .insert(toInsert)
    .select('id, unit_no');

  if (error) {
    // Unique (association_id, unit_no) conflict — fall back to row-by-row to
    // surface which unit_no duplicates so skipped list is accurate.
    if (error.code === '23505') {
      const rowByRow: typeof toInsert = [];
      const rowByRowSkipped: BulkImportSkipped[] = [...skipped];

      for (let i = 0; i < toInsert.length; i++) {
        const r = toInsert[i]!;
        const { error: rowErr } = await client.from('units').insert(r);

        if (rowErr) {
          const originalIdx = rows.findIndex(
            (orig) => orig.unit_no === r.unit_no,
          );
          rowByRowSkipped.push({
            row: originalIdx + 1,
            unit_no: r.unit_no,
            reason:
              rowErr.code === '23505'
                ? `Unit "${r.unit_no}" already exists`
                : rowErr.message,
          });
        } else {
          rowByRow.push(r);
        }
      }

      const imported = rowByRow.length;

      if (imported > 0) {
        await logAuditEvent({
          associationId,
          action: 'unit.bulk_imported',
          entityType: 'unit',
          entityId: associationId,
          summary: `Bulk imported ${imported} unit(s) via CSV`,
        });
        revalidatePath(UNITS_PATH, 'page');
      }

      return { success: true, imported, skipped: rowByRowSkipped };
    }

    return { success: false, imported: 0, skipped, error: error.message };
  }

  const imported = inserted?.length ?? 0;

  if (imported > 0) {
    await logAuditEvent({
      associationId,
      action: 'unit.bulk_imported',
      entityType: 'unit',
      entityId: associationId,
      summary: `Bulk imported ${imported} unit(s) via CSV`,
    });
    revalidatePath(UNITS_PATH, 'page');
  }

  return { success: true, imported, skipped };
}

async function isAssociationMemberWithRoles(
  client: SupabaseClient,
  associationId: string,
  userId: string,
  roles: ('assoc_admin' | 'billing_operator' | 'prop_owner' | 'tenant')[],
): Promise<boolean> {
  if (roles.length === 0) return false;

  const { data: association } = await client
    .from('associations')
    .select('account_id')
    .eq('id', associationId)
    .single();

  if (!association) {
    return false;
  }

  const { data: membership } = await client
    .from('accounts_memberships')
    .select('user_id')
    .eq('account_id', association.account_id)
    .eq('user_id', userId)
    .in('account_role', roles)
    .maybeSingle();

  return Boolean(membership);
}
