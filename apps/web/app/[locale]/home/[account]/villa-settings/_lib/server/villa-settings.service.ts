import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import type * as z from 'zod';

import { normalizePhoneNumber } from '@kit/shared/utils';

import type { Database } from '~/lib/database.types';
import { getVillaSite } from '~/lib/villa-db/client';
import { endAfterLastNight } from '~/lib/villa-db/dates';
import { VillaDbError } from '~/lib/villa-db/errors';
import {
  createPricingRule,
  deletePricingRule,
  updateBaseRates,
} from '~/lib/villa-db/rates';

import type {
  AddonSchema,
  BaseRatesSchema,
  ContactSchema,
  PoliciesSchema,
  SeasonalRateSchema,
} from '../schemas/villa-settings.schema';

type Client = SupabaseClient<Database>;

const GONE = 'This item no longer exists. Refresh the page.';

// An update/delete that matched no row (wrong or stale id, or RLS) must not
// report success.
function assertChanged(rows: unknown[] | null, message = GONE) {
  if (!rows || rows.length === 0) throw new Error(message);
}

/**
 * Villa settings. Site-side values (rates, occupancy, times, seasonal rates)
 * go through lib/villa-db; Ooruda-side values (add-ons, contacts, policies)
 * through the caller's RLS-scoped client. Callers authorise first.
 */
export function createVillaSettingsService(client: Client) {
  return {
    async saveBaseRates(
      input: z.output<typeof BaseRatesSchema>,
      actor: string,
    ) {
      const site = await getVillaSite(input.accountId, input.propertyId);

      return updateBaseRates(
        site,
        {
          weekdayNightly: input.weekdayNightly,
          weekendNightly: input.weekendNightly,
          extraGuestRate: input.extraGuestRate,
          extraGuestTier2Rate: input.extraGuestTier2Rate || null,
          extraGuestTier2From:
            input.extraGuestTier2From === '' ? null : input.extraGuestTier2From,
          includedGuests: input.includedGuests,
          maxGuests: input.maxGuests,
          idealGuests: input.idealGuests,
          checkInTime: input.checkInTime,
          checkOutTime: input.checkOutTime,
        },
        actor,
      );
    },

    async addSeasonalRate(
      input: z.output<typeof SeasonalRateSchema>,
      actor: string,
    ) {
      const site = await getVillaSite(input.accountId, input.propertyId);

      return createPricingRule(
        site,
        {
          name: input.name,
          startDate: input.firstNight,
          // The site stores the morning after the last night (half-open).
          endDate: endAfterLastNight(input.lastNight),
          nightlyRate: input.nightlyRate,
          minStayNights: input.minStayNights,
        },
        actor,
      );
    },

    async removeSeasonalRate(
      input: { accountId: string; propertyId: string; ruleId: string },
      actor: string,
    ) {
      const site = await getVillaSite(input.accountId, input.propertyId);
      await deletePricingRule(site, input.ruleId, actor);
    },

    async saveAddon(input: z.output<typeof AddonSchema>) {
      const row = {
        account_id: input.accountId,
        property_id: input.propertyId,
        name: input.name,
        description: input.description || null,
        price: Number(input.price),
        pricing_unit: input.pricingUnit,
        is_active: input.isActive,
      };

      const { data, error } = input.id
        ? await client
            .from('villa_addons')
            .update(row)
            .eq('id', input.id)
            .eq('account_id', input.accountId)
            .select('id')
        : await client.from('villa_addons').insert(row).select('id');

      if (error) {
        throw new Error(
          error.code === '23505'
            ? 'An add-on with that name already exists.'
            : 'Could not save the add-on.',
        );
      }

      assertChanged(data);
    },

    async deleteAddon(input: { accountId: string; id: string }) {
      const { data, error } = await client
        .from('villa_addons')
        .delete()
        .eq('id', input.id)
        .eq('account_id', input.accountId)
        .select('id');

      if (error) throw new Error('Could not remove the add-on.');
      assertChanged(data);
    },

    async saveContact(input: z.output<typeof ContactSchema>) {
      const phone = normalizePhoneNumber(input.phone);

      if (!phone) {
        throw new VillaDbError(
          'INVALID_INPUT',
          'bad phone',
          'Enter a valid phone number (with country code, or 10-digit Indian).',
        );
      }

      const row = {
        account_id: input.accountId,
        property_id: input.propertyId,
        category: input.category,
        name: input.name,
        phone,
        notes: input.notes || null,
        share_with_guests: input.shareWithGuests,
      };

      const { data, error } = input.id
        ? await client
            .from('villa_emergency_contacts')
            .update(row)
            .eq('id', input.id)
            .eq('account_id', input.accountId)
            .select('id')
        : await client
            .from('villa_emergency_contacts')
            .insert(row)
            .select('id');

      if (error) throw new Error('Could not save the contact.');
      assertChanged(data);
    },

    async deleteContact(input: { accountId: string; id: string }) {
      const { data, error } = await client
        .from('villa_emergency_contacts')
        .delete()
        .eq('id', input.id)
        .eq('account_id', input.accountId)
        .select('id');

      if (error) throw new Error('Could not remove the contact.');
      assertChanged(data);
    },

    async savePolicies(input: z.output<typeof PoliciesSchema>, actor: string) {
      const [settings, property] = await Promise.all([
        client.from('villa_account_settings').upsert(
          {
            account_id: input.accountId,
            managers_can_cancel: input.managersCanCancel,
            updated_by: actor,
          },
          { onConflict: 'account_id' },
        ),
        client
          .from('villa_properties')
          .update({ ota_buffer_nights: input.otaBufferNights })
          .eq('id', input.propertyId)
          .eq('account_id', input.accountId)
          .select('id'),
      ]);

      if (settings.error || property.error) {
        throw new Error('Could not save the settings.');
      }

      assertChanged(property.data, 'Could not save the settings.');
    },
  };
}
