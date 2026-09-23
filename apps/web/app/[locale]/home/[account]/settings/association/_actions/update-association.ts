'use server';

import { revalidatePath } from 'next/cache';

import * as z from 'zod';

import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { sanitizeActionError } from '~/lib/errors/sanitize-action-error';
import { getAssociationRole } from '~/lib/rbac';

const ASSOCIATION_SETTINGS_PATH = '/home/[account]/settings/association';

const AssociationSchema = z.object({
  status: z.enum(['Setup', 'Active', 'Suspended']),
  address: z.string().max(500).optional(),
  registration_number: z
    .string()
    .max(100)
    .nullable()
    .transform((v) => v || null),
  brand_colour: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default('#FCD469'),
  gstin: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
    .nullable()
    .or(z.literal('').transform(() => null)),
  gst_enabled: z.boolean().default(false),
  gst_rate: z.coerce.number().min(0).max(100).nullable(),
  mescom_consumer_no: z.string().max(50).optional(),
  authorised_signatory: z
    .string()
    .max(200)
    .nullable()
    .transform((v) => v || null),
  // sanctioned_load_kva - informational only (total load for the association
  // from the electricity board). Individual sub-meter load_kva values are what
  // drive minimum-charge calculations; this field is for admin reference only.
  sanctioned_load_kva: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number().positive('Load must be greater than 0').nullable().optional(),
  ),
  pan_number: z
    .string()
    .max(10, 'PAN must be 10 characters')
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format')
    .nullable()
    .or(z.literal('').transform(() => null)),
  email: z
    .string()
    .email()
    .max(200)
    .nullable()
    .or(z.literal('').transform(() => null)),
  phone: z
    .string()
    .max(20)
    .nullable()
    .transform((v) => v || null),
  bank_account_name: z
    .string()
    .max(200)
    .nullable()
    .transform((v) => v || null),
  bank_account_number: z
    .string()
    .max(50)
    .nullable()
    .transform((v) => v || null),
  bank_name: z
    .string()
    .max(100)
    .nullable()
    .transform((v) => v || null),
  bank_ifsc: z
    .string()
    .max(11)
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC format')
    .nullable()
    .or(z.literal('').transform(() => null)),
  bank_branch: z
    .string()
    .max(100)
    .nullable()
    .transform((v) => v || null),
});

const BillingSettingsSchema = z.object({
  electricity_due_day: z.coerce.number().int().min(1).max(28).default(10),
  maintenance_due_day: z.coerce.number().int().min(1).max(28).default(10),
  other_charges_due_day: z.coerce.number().int().min(1).max(28).default(10),
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
  // Editing association config - including status, GST and branding - is an
  // admin-only task; the underlying `associations` RLS policy is assoc_admin.
  const role = await getAssociationRole(associationId);

  if (role !== 'assoc_admin') {
    const logger = await getLogger();
    logger.warn(
      { associationId, role, action: 'updateAssociation' },
      'Permission denied',
    );
    return {
      success: false,
      error: 'You are not authorized to update this association.',
    };
  }

  const assocResult = AssociationSchema.safeParse({
    status: formData.get('status'),
    address: formData.get('address') || undefined,
    registration_number: formData.get('registration_number') || null,
    brand_colour: formData.get('brand_colour') || '#FCD469',
    gstin: formData.get('gstin') || '',
    gst_enabled: formData.get('gst_enabled') === 'on',
    gst_rate: formData.get('gst_rate') || null,
    mescom_consumer_no: formData.get('mescom_consumer_no') || undefined,
    authorised_signatory:
      (formData.get('authorised_signatory') as string) || null,
    sanctioned_load_kva: formData.get('sanctioned_load_kva') || null,
    pan_number: (formData.get('pan_number') as string) || '',
    email: (formData.get('email') as string) || '',
    phone: (formData.get('phone') as string) || null,
    bank_account_name: (formData.get('bank_account_name') as string) || null,
    bank_account_number:
      (formData.get('bank_account_number') as string) || null,
    bank_name: (formData.get('bank_name') as string) || null,
    bank_ifsc: (formData.get('bank_ifsc') as string) || '',
    bank_branch: (formData.get('bank_branch') as string) || null,
  });

  if (!assocResult.success) {
    return {
      success: false,
      error: 'Invalid form data. Check GSTIN, PAN, IFSC, or email format.',
    };
  }

  const billingResult = BillingSettingsSchema.safeParse({
    electricity_due_day: formData.get('electricity_due_day'),
    maintenance_due_day: formData.get('maintenance_due_day'),
    other_charges_due_day: formData.get('other_charges_due_day'),
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
    const { userMessage } = await sanitizeActionError(assocError, {
      action: 'updateAssociation',
      associationId,
    });
    return { success: false, error: userMessage };
  }

  const { error: billingError } = await client
    .from('billing_settings')
    .upsert(
      { ...billingResult.data, association_id: associationId },
      { onConflict: 'association_id' },
    );

  if (billingError) {
    const { userMessage } = await sanitizeActionError(billingError, {
      action: 'updateAssociationBillingSettings',
      associationId,
    });
    return { success: false, error: userMessage };
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
    const logger = await getLogger();
    logger.warn(
      { associationId, role, action: 'updateChargeTypeRate', chargeTypeId: id },
      'Permission denied',
    );
    return {
      success: false,
      error:
        "You don't have the required permission. Contact your association admin.",
    };
  }

  const client = getSupabaseServerClient();

  const { error } = await client
    .from('charge_types')
    .update({ rate_or_amount: rate })
    .eq('id', id)
    .eq('association_id', associationId);

  if (error) {
    const { userMessage } = await sanitizeActionError(error, {
      action: 'updateChargeTypeRate',
      associationId,
      chargeTypeId: id,
    });
    return { success: false, error: userMessage };
  }

  revalidatePath(ASSOCIATION_SETTINGS_PATH, 'page');

  return { success: true };
}

export async function updateChargeTypeCalcMethodAction(
  associationId: string,
  id: string,
  calcMethod: 'per_sqft' | 'per_unit',
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseServerClient();
  const { data: isSuperAdmin } = await client.rpc('is_super_admin');

  if (!isSuperAdmin) {
    const logger = await getLogger();
    logger.warn(
      { associationId, action: 'updateChargeTypeCalcMethod', chargeTypeId: id },
      'Permission denied: super admin required',
    );
    return {
      success: false,
      error: "You don't have the required permission.",
    };
  }

  const { error } = await client
    .from('charge_types')
    .update({ calc_method: calcMethod })
    .eq('id', id)
    .eq('association_id', associationId);

  if (error) {
    const { userMessage } = await sanitizeActionError(error, {
      action: 'updateChargeTypeCalcMethod',
      associationId,
      chargeTypeId: id,
    });
    return { success: false, error: userMessage };
  }

  revalidatePath(ASSOCIATION_SETTINGS_PATH, 'page');

  return { success: true };
}

export async function updateChargeTypeGstApplicableAction(
  associationId: string,
  id: string,
  gstApplicable: boolean,
): Promise<{ success: boolean; error?: string }> {
  const role = await getAssociationRole(associationId);

  if (role !== 'assoc_admin' && role !== 'billing_operator') {
    const logger = await getLogger();
    logger.warn(
      {
        associationId,
        role,
        action: 'updateChargeTypeGstApplicable',
        chargeTypeId: id,
      },
      'Permission denied',
    );
    return {
      success: false,
      error:
        "You don't have the required permission. Contact your association admin.",
    };
  }

  const client = getSupabaseServerClient();

  const { error } = await client
    .from('charge_types')
    .update({ gst_applicable: gstApplicable })
    .eq('id', id)
    .eq('association_id', associationId);

  if (error) {
    const { userMessage } = await sanitizeActionError(error, {
      action: 'updateChargeTypeGstApplicable',
      associationId,
      chargeTypeId: id,
    });
    return { success: false, error: userMessage };
  }

  revalidatePath(ASSOCIATION_SETTINGS_PATH, 'page');

  return { success: true };
}

export async function toggleChargeTypeAction(
  associationId: string,
  id: string,
  isActive: boolean,
): Promise<{ success: boolean; error?: string }> {
  // Toggling charge types is allowed for admins and billing operators -
  // mirrors the `operator_update` RLS policy on charge_types.
  const role = await getAssociationRole(associationId);

  if (role !== 'assoc_admin' && role !== 'billing_operator') {
    const logger = await getLogger();
    logger.warn(
      { associationId, role, action: 'toggleChargeType', chargeTypeId: id },
      'Permission denied',
    );
    return {
      success: false,
      error:
        "You don't have the required permission. Contact your association admin.",
    };
  }

  const client = getSupabaseServerClient();

  const { error } = await client
    .from('charge_types')
    .update({ is_active: isActive })
    .eq('id', id)
    .eq('association_id', associationId);

  if (error) {
    const { userMessage } = await sanitizeActionError(error, {
      action: 'toggleChargeType',
      associationId,
      chargeTypeId: id,
    });
    return { success: false, error: userMessage };
  }

  revalidatePath(ASSOCIATION_SETTINGS_PATH, 'page');

  return { success: true };
}

// ─── Payment Gateway ──────────────────────────────────────────────────────────

const CreateGatewaySchema = z.object({
  key_id: z.string().min(1, 'Key ID is required').max(255),
  key_secret: z.string().min(1, 'Key Secret is required').max(255),
  webhook_secret: z.string().max(255).optional(),
});

export type GatewayActionState = { success?: boolean; error?: string } | null;

// Insert-only - credentials cannot be edited after creation.
// To rotate keys, delete and re-create.
export async function createPaymentGatewayAction(
  associationId: string,
  _prevState: GatewayActionState,
  formData: FormData,
): Promise<GatewayActionState> {
  const role = await getAssociationRole(associationId);
  if (role !== 'assoc_admin') {
    const logger = await getLogger();
    logger.warn(
      { associationId, role, action: 'createPaymentGateway' },
      'Permission denied',
    );
    return {
      success: false,
      error: 'Only association admins can configure the payment gateway.',
    };
  }

  const trim = (v: FormDataEntryValue | null) =>
    typeof v === 'string' ? v.trim() || undefined : undefined;

  const parsed = CreateGatewaySchema.safeParse({
    key_id: formData.get('key_id'),
    key_secret: trim(formData.get('key_secret')),
    webhook_secret: trim(formData.get('webhook_secret')),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input.',
    };
  }

  const admin = getSupabaseServerAdminClient();

  const { data: existing, error: lookupError } = await admin
    .from('association_payment_gateways')
    .select('id')
    .eq('association_id', associationId)
    .maybeSingle();

  if (lookupError) {
    const { userMessage } = await sanitizeActionError(lookupError, {
      action: 'createPaymentGateway.lookup',
      associationId,
    });
    return { success: false, error: userMessage };
  }

  if (existing) {
    return {
      success: false,
      error:
        'A gateway is already configured. Delete it first to set up new credentials.',
    };
  }

  const { error } = await admin.from('association_payment_gateways').insert({
    association_id: associationId,
    provider: 'razorpay',
    key_id: parsed.data.key_id,
    key_secret: parsed.data.key_secret,
    webhook_secret: parsed.data.webhook_secret,
    is_active: true,
  });

  if (error) {
    const { userMessage } = await sanitizeActionError(error, {
      action: 'createPaymentGateway',
      associationId,
    });
    return { success: false, error: userMessage };
  }

  revalidatePath(ASSOCIATION_SETTINGS_PATH, 'page');
  return { success: true };
}

export async function toggleGatewayActiveAction(
  associationId: string,
  isActive: boolean,
): Promise<GatewayActionState> {
  const role = await getAssociationRole(associationId);
  if (role !== 'assoc_admin') {
    const logger = await getLogger();
    logger.warn(
      { associationId, role, action: 'toggleGatewayActive' },
      'Permission denied',
    );
    return {
      success: false,
      error:
        "You don't have the required permission. Contact your association admin.",
    };
  }

  const admin = getSupabaseServerAdminClient();
  const { error } = await admin
    .from('association_payment_gateways')
    .update({ is_active: isActive })
    .eq('association_id', associationId);

  if (error) {
    const { userMessage } = await sanitizeActionError(error, {
      action: 'toggleGatewayActive',
      associationId,
    });
    return { success: false, error: userMessage };
  }

  revalidatePath(ASSOCIATION_SETTINGS_PATH, 'page');
  return { success: true };
}

export async function deletePaymentGatewayAction(
  associationId: string,
): Promise<GatewayActionState> {
  const role = await getAssociationRole(associationId);
  if (role !== 'assoc_admin') {
    const logger = await getLogger();
    logger.warn(
      { associationId, role, action: 'deletePaymentGateway' },
      'Permission denied',
    );
    return {
      success: false,
      error:
        "You don't have the required permission. Contact your association admin.",
    };
  }

  const admin = getSupabaseServerAdminClient();
  const { error } = await admin
    .from('association_payment_gateways')
    .delete()
    .eq('association_id', associationId);

  if (error) {
    const { userMessage } = await sanitizeActionError(error, {
      action: 'deletePaymentGateway',
      associationId,
    });
    return { success: false, error: userMessage };
  }

  revalidatePath(ASSOCIATION_SETTINGS_PATH, 'page');
  return { success: true };
}

export async function toggleCashLedgerEnabledAction(
  associationId: string,
  enabled: boolean,
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseServerClient();
  const { data: isSuperAdmin } = await client.rpc('is_super_admin');

  if (!isSuperAdmin) {
    return { success: false, error: 'Super admin permission required.' };
  }

  const { error } = await client
    .from('associations')
    .update({ cash_ledger_enabled: enabled })
    .eq('id', associationId);

  if (error) {
    const { userMessage } = await sanitizeActionError(error, {
      action: 'toggleCashLedgerEnabled',
      associationId,
    });
    return { success: false, error: userMessage };
  }

  revalidatePath(ASSOCIATION_SETTINGS_PATH, 'page');
  return { success: true };
}
