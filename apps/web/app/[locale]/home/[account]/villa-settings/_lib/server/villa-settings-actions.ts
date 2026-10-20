'use server';

import { revalidatePath } from 'next/cache';

import { authActionClient } from '@kit/next/safe-action';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { requireVillaRole } from '~/lib/villa/auth';
import { revalidateBookingSite } from '~/lib/villa/revalidate-site';

import {
  AddonSchema,
  BaseRatesSchema,
  ContactSchema,
  DeleteAddonSchema,
  DeleteContactSchema,
  DeleteSeasonalRateSchema,
  PoliciesSchema,
  SeasonalRateSchema,
} from '../schemas/villa-settings.schema';
import { createVillaSettingsService } from './villa-settings.service';

// Every villa settings change is owner-only (managers read). RLS enforces the
// Ooruda-side tables; site-side writes run with the booking site's service
// key, so this check is the gate for those.
async function ownerService(accountId: string) {
  await requireVillaRole(accountId, ['villa_admin']);
  return createVillaSettingsService(getSupabaseServerClient());
}

function revalidateSettings() {
  revalidatePath('/[locale]/home/[account]/villa-settings', 'page');
}

/**
 * Refreshes this page AND the guest booking site, for the settings the site
 * renders: rates, seasonal rates and policies. Add-ons and emergency contacts
 * are Ooruda-only, so they revalidate locally alone.
 */
async function revalidateSettingsAndSite(reason: string) {
  revalidateSettings();
  await revalidateBookingSite(reason);
}

export const saveBaseRatesAction = authActionClient
  .inputSchema(BaseRatesSchema)
  .action(async ({ parsedInput, ctx }) => {
    const service = await ownerService(parsedInput.accountId);
    const rates = await service.saveBaseRates(parsedInput, ctx.user.id);
    await revalidateSettingsAndSite('base-rates');
    return rates;
  });

export const addSeasonalRateAction = authActionClient
  .inputSchema(SeasonalRateSchema)
  .action(async ({ parsedInput, ctx }) => {
    const service = await ownerService(parsedInput.accountId);
    const rule = await service.addSeasonalRate(parsedInput, ctx.user.id);
    await revalidateSettingsAndSite('seasonal-rate-added');
    return rule;
  });

export const deleteSeasonalRateAction = authActionClient
  .inputSchema(DeleteSeasonalRateSchema)
  .action(async ({ parsedInput, ctx }) => {
    const service = await ownerService(parsedInput.accountId);
    await service.removeSeasonalRate(parsedInput, ctx.user.id);
    await revalidateSettingsAndSite('seasonal-rate-removed');
  });

export const saveAddonAction = authActionClient
  .inputSchema(AddonSchema)
  .action(async ({ parsedInput }) => {
    const service = await ownerService(parsedInput.accountId);
    await service.saveAddon(parsedInput);
    revalidateSettings();
  });

export const deleteAddonAction = authActionClient
  .inputSchema(DeleteAddonSchema)
  .action(async ({ parsedInput }) => {
    const service = await ownerService(parsedInput.accountId);
    await service.deleteAddon(parsedInput);
    revalidateSettings();
  });

export const saveContactAction = authActionClient
  .inputSchema(ContactSchema)
  .action(async ({ parsedInput }) => {
    const service = await ownerService(parsedInput.accountId);
    await service.saveContact(parsedInput);
    revalidateSettings();
  });

export const deleteContactAction = authActionClient
  .inputSchema(DeleteContactSchema)
  .action(async ({ parsedInput }) => {
    const service = await ownerService(parsedInput.accountId);
    await service.deleteContact(parsedInput);
    revalidateSettings();
  });

export const savePoliciesAction = authActionClient
  .inputSchema(PoliciesSchema)
  .action(async ({ parsedInput, ctx }) => {
    const service = await ownerService(parsedInput.accountId);
    await service.savePolicies(parsedInput, ctx.user.id);
    await revalidateSettingsAndSite('policies');
  });
