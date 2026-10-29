import 'server-only';
import { cache } from 'react';

import type { SupabaseClient } from '@supabase/supabase-js';

import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import type { Database } from '~/lib/database.types';

export interface VillaPropertySummary {
  id: string;
  name: string;
  status: string;
  /** Linked to a booking site (the site-side screens need this). */
  connected: boolean;
  /** The account this property belongs to (for the villa-site guard). */
  accountId: string;
  /** properties.id on the villa-booking database; null when not linked. */
  sitePropertyId: string | null;
  bookingCodePrefix: string | null;
  otaBufferNights: number;
  retentionDays: number;
}

/**
 * A villa account's properties (RLS: members only), oldest first.
 * Request-cached. Throws on a query error rather than pretending the villa
 * has no properties.
 */
export const loadVillaProperties = cache(
  async (accountId: string): Promise<VillaPropertySummary[]> =>
    queryVillaProperties(getSupabaseServerClient(), accountId),
);

/**
 * The same list for the SYSTEM: the scheduled run has no user session, so the
 * RLS-enforced client is refused outright (`villa_role()` is null for it, and
 * the anon role cannot read the table at all). Service role, so it is only
 * ever reached from a path that has already authorised itself — today the
 * cron route, which checks CRON_SECRET.
 */
export const loadVillaPropertiesAsSystem = cache(
  async (accountId: string): Promise<VillaPropertySummary[]> =>
    queryVillaProperties(getSupabaseServerAdminClient(), accountId),
);

async function queryVillaProperties(
  client: SupabaseClient<Database>,
  accountId: string,
): Promise<VillaPropertySummary[]> {
  const { data, error } = await client
    .from('villa_properties')
    .select(
      'id, account_id, name, status, site_property_id, booking_code_prefix, ota_buffer_nights, retention_days',
    )
    .eq('account_id', accountId)
    .order('created_at');

  if (error) {
    (await getLogger()).error(
      { accountId, code: error.code },
      'villa properties load failed',
    );
    throw new Error('Could not load the villa properties.');
  }

  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    connected: p.site_property_id !== null,
    accountId: p.account_id,
    sitePropertyId: p.site_property_id,
    bookingCodePrefix: p.booking_code_prefix,
    otaBufferNights: p.ota_buffer_nights,
    retentionDays: p.retention_days,
  }));
}

/**
 * The property a page works on: the requested one if it is valid, else the
 * first eligible. `requireSite` limits the choice to active, connected
 * properties (bookings, calendar); settings may open any property.
 */
export async function selectVillaProperty(
  accountId: string,
  requested: string | undefined,
  options: { requireSite?: boolean } = {},
): Promise<{
  properties: VillaPropertySummary[];
  property: VillaPropertySummary | null;
  /** True when `requested` was given but is not a valid choice. */
  invalidRequest: boolean;
}> {
  const all = await loadVillaProperties(accountId);
  const properties = options.requireSite
    ? all.filter((p) => p.status === 'active' && p.connected)
    : all;

  const match = requested
    ? properties.find((p) => p.id === requested)
    : undefined;

  return {
    properties,
    property: match ?? properties[0] ?? null,
    invalidRequest: Boolean(requested) && !match,
  };
}

/**
 * One property of this account by id, from the same request-cached list the
 * pages already load. Returns null when it is not this account's (which is
 * indistinguishable from a missing one, on purpose).
 *
 * This exists so `getVillaSite` needs no second villa_properties query: on a
 * remote database that round trip is on the critical path of every villa page.
 */
export async function findVillaProperty(
  accountId: string,
  propertyId: string,
): Promise<VillaPropertySummary | null> {
  const all = await loadVillaProperties(accountId);

  return all.find((p) => p.id === propertyId) ?? null;
}

/** `findVillaProperty` for the system (see loadVillaPropertiesAsSystem). */
export async function findVillaPropertyAsSystem(
  accountId: string,
  propertyId: string,
): Promise<VillaPropertySummary | null> {
  const all = await loadVillaPropertiesAsSystem(accountId);

  return all.find((p) => p.id === propertyId) ?? null;
}
