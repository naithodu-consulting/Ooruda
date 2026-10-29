'use server';

import { revalidatePath } from 'next/cache';

import { authActionClient } from '@kit/next/safe-action';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { getVillaSite } from '~/lib/villa-db/client';
import { requireVillaRole } from '~/lib/villa/auth';
import { revalidateBookingSite } from '~/lib/villa/revalidate-site';

import {
  AddonSchema,
  BaseRatesSchema,
  BookingCutoffSchema,
  BusinessDetailsSchema,
  ContactSchema,
  DeleteAddonSchema,
  DeleteContactSchema,
  DeleteSeasonalRateSchema,
  GuestEmailSettingsSchema,
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

export const saveBusinessDetailsAction = authActionClient
  .inputSchema(BusinessDetailsSchema)
  .action(async ({ parsedInput }) => {
    const service = await ownerService(parsedInput.accountId);
    await service.saveBusinessDetails(parsedInput);
    // The booking site prints the same company on its own receipts, so it is
    // refreshed alongside this page.
    await revalidateSettingsAndSite('policies');
  });

export const savePoliciesAction = authActionClient
  .inputSchema(PoliciesSchema)
  .action(async ({ parsedInput, ctx }) => {
    const service = await ownerService(parsedInput.accountId);
    await service.savePolicies(parsedInput, ctx.user.id);
    await revalidateSettingsAndSite('policies');
  });

export const saveBookingCutoffAction = authActionClient
  .inputSchema(BookingCutoffSchema)
  .action(async ({ parsedInput }) => {
    await requireVillaRole(parsedInput.accountId, ['villa_admin']);
    const client = getSupabaseServerClient();

    // 1. Save to Ooruda's settings (controls the admin "New booking" dialog).
    const { error } = await client
      .from('villa_account_settings')
      .update({ booking_cutoff_date: parsedInput.cutoffDate })
      .eq('account_id', parsedInput.accountId);

    if (error) throw new Error(`Could not save cutoff: ${error.message}`);

    // 2. Write to the villa-booking DB so the guest site respects it too.
    const site = await getVillaSite(
      parsedInput.accountId,
      parsedInput.propertyId,
    );
    // The column is added by villa-booking migration 00097. The villa-booking
    // DB types in this repo lag behind, so we cast to bypass the type check.
    const { error: siteError } = await site.client
      .from('properties')
      .update({ booking_cutoff_date: parsedInput.cutoffDate } as never)
      .eq('id', site.sitePropertyId);

    if (siteError) {
      throw new Error(
        `Saved locally but could not sync to booking site: ${siteError.message}`,
      );
    }

    revalidateSettings();
    revalidatePath('/[locale]/home/[account]/bookings', 'page');
    await revalidateBookingSite('booking-cutoff');
  });

export const saveGuestEmailSettingsAction = authActionClient
  .inputSchema(GuestEmailSettingsSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireVillaRole(parsedInput.accountId, ['villa_admin']);
    const client = getSupabaseServerClient();

    const { data, error } = await client
      .from('villa_account_settings')
      .upsert(
        {
          account_id: parsedInput.accountId,
          pre_arrival_email: parsedInput.preArrivalEmail,
          thank_you_email: parsedInput.thankYouEmail,
          updated_by: ctx.user.id,
        },
        { onConflict: 'account_id' },
      )
      .select('account_id');

    if (error || !data?.length) {
      throw new Error(
        `Could not save email settings${error ? `: ${error.message}` : '.'}`,
      );
    }

    revalidateSettings();
    revalidatePath('/[locale]/home/[account]/bookings', 'layout');
  });
