'use server';

import { revalidatePath } from 'next/cache';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { getAssociationRole } from '~/lib/rbac';

import { type CreateUnitInput, CreateUnitSchema } from './units-schema';

const UNITS_PATH = '/home/[account]/units';

type ActionResult = { success: boolean; error?: string };

/**
 * Create a unit under an association. Admin-only — mirrors the `admin_insert`
 * RLS policy on `units`. The role check here is defense-in-depth on top of RLS
 * and lets us return a friendly message instead of a raw DB error.
 */
export async function createUnitAction(
  associationId: string,
  input: CreateUnitInput,
): Promise<ActionResult> {
  const role = await getAssociationRole(associationId);

  if (role !== 'assoc_admin') {
    return { success: false, error: 'You are not allowed to add units.' };
  }

  const parsed = CreateUnitSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Please check the form.',
    };
  }

  const client = getSupabaseServerClient();

  const { error } = await client.from('units').insert({
    association_id: associationId,
    unit_no: parsed.data.unit_no,
    type: parsed.data.type,
    floor: parsed.data.floor ?? null,
    area_sqft: parsed.data.area_sqft,
  });

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

  revalidatePath(UNITS_PATH, 'page');

  return { success: true };
}
