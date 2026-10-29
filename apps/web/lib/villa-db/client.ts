import 'server-only';
import { cache } from 'react';

import { type SupabaseClient, createClient } from '@supabase/supabase-js';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import {
  type VillaPropertySummary,
  findVillaProperty,
  findVillaPropertyAsSystem,
} from '~/lib/villa/properties';

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

/**
 * The same fetch, but a booking site that rejects our credentials drops them
 * from the cache so the very next request resolves them again.
 *
 * Without this, rotating a villa's service key would break every one of its
 * screens until the cached copy expired. With it the failure window is one
 * request, which is what it was before the cache existed.
 */
function fetchForProperty(propertyId: string): typeof fetch {
  return async (input, init) => {
    const response = await fetchWithTimeout(input, init);

    if (response.status === 401 || response.status === 403) {
      credentialCache.delete(propertyId);
    }

    return response;
  };
}

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

type Credentials = { url: string; serviceKey: string };

/**
 * How long a resolved booking-site credential is reused in this process.
 *
 * The Vault lookup is a round trip to Ooruda's database on the critical path
 * of EVERY villa page, so it is worth not repeating per request. Kept short so
 * a key rotated in the database is picked up without a deploy, and in-process
 * only: nothing is written to disk, to a cookie, to a log or to the browser,
 * and the map dies with the server instance.
 *
 * A cached key can never outlive the property's own state: `buildSite` reads
 * the property row first (request-scoped, never cached beyond the request) and
 * refuses a property that is inactive or no longer linked BEFORE it asks for
 * credentials. So unlinking or switching off a villa takes effect at once,
 * even though its key may sit in this map for a few minutes longer. Connecting
 * a villa to a DIFFERENT booking-site property makes a new villa_properties
 * row (connect_villa_property matches on site_project_ref + site_property_id),
 * so that gets a new cache key too.
 *
 * The one case the property row cannot catch is a key ROTATED for the same
 * site property. `fetchForProperty` handles it: the first request the site
 * rejects evicts the entry, so the next one resolves the new key.
 *
 * The map holds one entry per villa property the process has served, so it is
 * bounded by the number of villas, not by traffic.
 */
const CREDENTIAL_TTL_MS = 5 * 60_000;

const credentialCache = new Map<
  string,
  { value: Credentials; expiresAt: number }
>();

async function loadCredentials(
  propertyId: string,
): Promise<Credentials | null> {
  const override = localOverride();

  if (override) return override;

  const cached = credentialCache.get(propertyId);

  if (cached && cached.expiresAt > Date.now()) return cached.value;

  // Expired (or never held): drop it before the lookup so a failure below
  // never leaves a stale key behind.
  credentialCache.delete(propertyId);

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

  if (!row?.url || !row?.service_key) return null;

  const value: Credentials = { url: row.url, serviceKey: row.service_key };

  credentialCache.set(propertyId, {
    value,
    expiresAt: Date.now() + CREDENTIAL_TTL_MS,
  });

  return value;
}

/**
 * The villa-booking connection for one Ooruda villa property, after checking
 * the property belongs to `accountId`. Request-cached.
 */
export const getVillaSite = cache(
  async (accountId: string, propertyId: string): Promise<VillaSite> =>
    buildSite(
      accountId,
      propertyId,
      await findVillaProperty(accountId, propertyId),
    ),
);

/**
 * The same connection for the SYSTEM (the scheduled sync), which has no user
 * session: the RLS-enforced property lookup is refused for it outright, so the
 * property is resolved with the service role instead. Only reachable from a
 * path that has already authorised itself — today the cron route, which
 * checks CRON_SECRET. Authorization is still the caller's job.
 */
export const getVillaSiteAsSystem = cache(
  async (accountId: string, propertyId: string): Promise<VillaSite> =>
    buildSite(
      accountId,
      propertyId,
      await findVillaPropertyAsSystem(accountId, propertyId),
    ),
);

async function buildSite(
  accountId: string,
  propertyId: string,
  property: VillaPropertySummary | null,
): Promise<VillaSite> {
  // The property row comes from `loadVillaProperties`, which the pages have
  // already loaded (request-cached): on a remote database a second
  // villa_properties query here is a round trip per page for nothing. The
  // account_id is still verified as a belt-and-suspenders guard.

  // A property of another account is indistinguishable from a missing one.
  if (!property || property.accountId !== accountId) {
    throw new VillaDbError('NOT_FOUND', `villa property ${propertyId}`);
  }

  // Switched off by the owner: no reads or writes on the site.
  if (property.status !== 'active') {
    throw new VillaDbError(
      'INACTIVE',
      `villa property ${propertyId} is ${property.status}`,
    );
  }

  if (!property.sitePropertyId) {
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
        fetch: fetchForProperty(property.id),
      },
    },
  );

  return {
    client,
    propertyId: property.id,
    accountId: property.accountId,
    sitePropertyId: property.sitePropertyId,
    bookingCodePrefix: property.bookingCodePrefix,
    name: property.name,
  };
}

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
