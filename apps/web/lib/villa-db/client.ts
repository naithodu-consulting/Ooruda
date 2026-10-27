import 'server-only';
import { cache } from 'react';

import { type SupabaseClient, createClient } from '@supabase/supabase-js';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { VillaDbError, fromSiteError } from './errors';
import type { Database as VillaDatabase } from './villa-db.types';

/**
 * Connection to a property's villa-booking database (the guest site's).
 *
 * This module is the ONLY place a villa-booking service-role key is handled.
 * That key bypasses all row-level security on the guest site, so:
 *   - it is resolved server-side only (`server-only` above), per property, from
 *     Supabase Vault via `get_villa_site_credentials` (service role only);
 *   - it is never logged, returned to a caller, or sent to the browser;
 *   - the local-development override (env vars) is honoured only for a
 *     localhost URL, so it can never silently point a deployed app elsewhere.
 *
 * Authorization is the caller's job: resolve the property only after
 * `requireRole(..., 'villa')` or an equivalent check, and pass the account id
 * so a property of another account is refused here as well.
 */

export type VillaDbClient = SupabaseClient<VillaDatabase>;

export interface VillaSite {
  client: VillaDbClient;
  /** Ooruda villa_properties.id */
  propertyId: string;
  accountId: string;
  /** properties.id on the villa-booking database */
  sitePropertyId: string;
  bookingCodePrefix: string | null;
  name: string;
}

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** No request to a booking site may hang a page or an action. */
export const VILLA_DB_TIMEOUT_MS = 10_000;

const fetchWithTimeout: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    signal: init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(VILLA_DB_TIMEOUT_MS)])
      : AbortSignal.timeout(VILLA_DB_TIMEOUT_MS),
  });

function localOverride(): { url: string; serviceKey: string } | null {
  if (process.env.VILLA_DB_LOCAL_OVERRIDE !== 'true') return null;

  const url = process.env.VILLA_DB_URL;
  const serviceKey = process.env.VILLA_DB_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) return null;

  let host: string;

  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }

  // Never let the override reach a non-local database.
  return LOCAL_HOSTS.has(host) ? { url, serviceKey } : null;
}

async function loadCredentials(
  propertyId: string,
): Promise<{ url: string; serviceKey: string } | null> {
  const override = localOverride();

  if (override) return override;

  const { data, error } = await getSupabaseServerAdminClient().rpc(
    'get_villa_site_credentials',
    { p_property_id: propertyId },
  );

  if (error) {
    throw new VillaDbError(
      'UNKNOWN',
      `credential lookup failed: ${error.message}`,
    );
  }

  const row = Array.isArray(data) ? data[0] : data;

  return row?.url && row?.service_key
    ? { url: row.url, serviceKey: row.service_key }
    : null;
}

/**
 * The villa-booking connection for one Ooruda villa property, after checking
 * the property belongs to `accountId`. Request-cached.
 */
export const getVillaSite = cache(
  async (accountId: string, propertyId: string): Promise<VillaSite> => {
    // Use the regular server client (RLS-enforced) so this works with both
    // the local Supabase (where SUPABASE_SECRET_KEY may not match the local
    // JWT secret) and the remote project. RLS on villa_properties already
    // limits rows to the caller's own account; we still verify account_id
    // below as a belt-and-suspenders guard.
    const { data: property, error } = await getSupabaseServerClient()
      .from('villa_properties')
      .select(
        'id, account_id, name, site_property_id, booking_code_prefix, status',
      )
      .eq('id', propertyId)
      .maybeSingle();

    if (error) {
      throw new VillaDbError(
        'UNKNOWN',
        `property lookup failed: ${error.message}`,
      );
    }

    // A property of another account is indistinguishable from a missing one.
    if (!property || property.account_id !== accountId) {
      throw new VillaDbError('NOT_FOUND', `villa property ${propertyId}`);
    }

    // Switched off by the owner: no reads or writes on the site.
    if (property.status !== 'active') {
      throw new VillaDbError(
        'INACTIVE',
        `villa property ${propertyId} is ${property.status}`,
      );
    }

    if (!property.site_property_id) {
      throw new VillaDbError(
        'NOT_CONFIGURED',
        `no site_property_id for ${propertyId}`,
      );
    }

    const credentials = await loadCredentials(propertyId);

    if (!credentials) {
      throw new VillaDbError(
        'NOT_CONFIGURED',
        `no credentials for ${propertyId}`,
      );
    }

    const client = createClient<VillaDatabase>(
      credentials.url,
      credentials.serviceKey,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          headers: { 'x-client-info': 'ooruda-villa' },
          fetch: fetchWithTimeout,
        },
      },
    );

    return {
      client,
      propertyId: property.id,
      accountId: property.account_id,
      sitePropertyId: property.site_property_id,
      bookingCodePrefix: property.booking_code_prefix,
      name: property.name,
    };
  },
);

/**
 * Cheapest possible read proving the credentials work and this villa's site
 * property exists. Throws a VillaDbError otherwise.
 */
export async function checkSiteReachable(site: VillaSite): Promise<void> {
  const { data, error } = await site.client
    .from('properties')
    .select('id')
    .eq('id', site.sitePropertyId)
    .limit(1)
    .maybeSingle();

  if (error) throw fromSiteError(error);
  if (!data)
    throw new VillaDbError('NOT_FOUND', `site property ${site.sitePropertyId}`);
}
