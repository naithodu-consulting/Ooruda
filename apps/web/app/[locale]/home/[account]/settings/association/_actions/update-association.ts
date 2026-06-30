'use server';

import { revalidatePath } from 'next/cache';

import * as z from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { getAssociationRole } from '~/lib/rbac';

const ASSOCIATION_SETTINGS_PATH = '/home/[account]/settings/association';

const AssociationSchema = z.object({
  status: z.enum(['Setup', 'Active', 'Suspended']),
  address: z.string().max(500).optional(),
  brand_colour: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default('#FCD469'),
  gstin: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
    .optional()
    .or(z.literal('')),
  gst_enabled: z.boolean().default(false),
  gst_rate: z.coerce.number().min(0).max(100).nullable(),
  mescom_consumer_no: z.string().max(50).optional(),
});

const BillingSettingsSchema = z.object({
  due_day_of_month: z.coerce.number().int().min(1).max(28).default(10),
});

export type UpdateAssociationState = {
  success?: boolean;
  error?: string;
} | null;

export async function updateAssociationAction(
  associationId: string,
  _prevState: UpdateAssociationState,
  formData: FormData,
): Promise<UpdateAssociationState> {
  // Explicit authorization check (defense-in-depth on top of RLS).
  // Editing association config — including status, GST and branding — is an
  // admin-only task; the underlying `associations` RLS policy is assoc_admin.
  const role = await getAssociationRole(associationId);

  if (role !== 'assoc_admin') {
    return {
      success: false,
      error: 'You are not authorized to update this association.',
    };
  }

  const assocResult = AssociationSchema.safeParse({
    status: formData.get('status'),
    address: formData.get('address') || undefined,
    brand_colour: formData.get('brand_colour') || '#FCD469',
    gstin: formData.get('gstin') || '',
    gst_enabled: formData.get('gst_enabled') === 'on',
    gst_rate: formData.get('gst_rate') || null,
    mescom_consumer_no: formData.get('mescom_consumer_no') || undefined,
  });

  if (!assocResult.success) {
    return { success: false, error: 'Invalid form data. Check GSTIN format.' };
  }

  const billingResult = BillingSettingsSchema.safeParse({
    due_day_of_month: formData.get('due_day_of_month'),
  });

  if (!billingResult.success) {
    return { success: false, error: 'Invalid billing settings.' };
  }

  const client = getSupabaseServerClient();

  const { error: assocError } = await client
    .from('associations')
    .update(assocResult.data)
    .eq('id', associationId);

  if (assocError) {
    return { success: false, error: assocError.message };
  }

  const { error: billingError } = await client
    .from('billing_settings')
    .update(billingResult.data)
    .eq('association_id', associationId);

  if (billingError) {
    return { success: false, error: billingError.message };
  }

  revalidatePath(ASSOCIATION_SETTINGS_PATH, 'page');

  return { success: true };
}

export async function updateChargeTypeRateAction(
  associationId: string,
  id: string,
  rate: number | null,
): Promise<{ success: boolean; error?: string }> {
  const role = await getAssociationRole(associationId);

  if (role !== 'assoc_admin' && role !== 'billing_operator') {
    return { success: false, error: 'Not authorized.' };
  }

  const client = getSupabaseServerClient();

  const { error } = await client
    .from('charge_types')
    .update({ rate_or_amount: rate })
    .eq('id', id)
    .eq('association_id', associationId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(ASSOCIATION_SETTINGS_PATH, 'page');

  return { success: true };
}

export async function updateChargeTypeCalcMethodAction(
  associationId: string,
  id: string,
  calcMethod: 'per_sqft' | 'per_unit',
): Promise<{ success: boolean; error?: string }> {
  const role = await getAssociationRole(associationId);

  if (role !== 'assoc_admin' && role !== 'billing_operator') {
    return { success: false, error: 'Not authorized.' };
  }

  const client = getSupabaseServerClient();

  const { error } = await client
    .from('charge_types')
    .update({ calc_method: calcMethod })
    .eq('id', id)
    .eq('association_id', associationId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(ASSOCIATION_SETTINGS_PATH, 'page');

  return { success: true };
}

export async function toggleChargeTypeAction(
  associationId: string,
  id: string,
  isActive: boolean,
): Promise<{ success: boolean; error?: string }> {
  // Toggling charge types is allowed for admins and billing operators —
  // mirrors the `operator_update` RLS policy on charge_types.
  const role = await getAssociationRole(associationId);

  if (role !== 'assoc_admin' && role !== 'billing_operator') {
    return { success: false, error: 'Not authorized.' };
  }

  const client = getSupabaseServerClient();

  const { error } = await client
    .from('charge_types')
    .update({ is_active: isActive })
    .eq('id', id)
    .eq('association_id', associationId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(ASSOCIATION_SETTINGS_PATH, 'page');

  return { success: true };
}
