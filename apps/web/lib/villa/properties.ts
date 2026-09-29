import 'server-only';
import { cache } from 'react';

import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

export interface VillaPropertySummary {
  id: string;
  name: string;
  status: string;
  /** Linked to a booking site (the site-side screens need this). */
  connected: boolean;
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
  async (accountId: string): Promise<VillaPropertySummary[]> => {
    const { data, error } = await getSupabaseServerClient()
      .from('villa_properties')
      .select(
        'id, name, status, site_property_id, booking_code_prefix, ota_buffer_nights, retention_days',
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
      bookingCodePrefix: p.booking_code_prefix,
      otaBufferNights: p.ota_buffer_nights,
      retentionDays: p.retention_days,
    }));
  },
);

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
