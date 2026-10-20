import 'server-only';
import { cache } from 'react';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

export type AssociationFeature = 'expense_tracker' | 'amc_reminder';

/**
 * Loads the per-association feature switches (cash ledger, expense tracker,
 * AMC reminders) in a single query, looked up by account slug.
 *
 * Cached per request: the workspace layout needs these to build the sidebar
 * and the gated pages need them to redirect, so they share one round trip.
 */
export const loadAssociationFeatures = cache(async (accountSlug: string) => {
  const client = getSupabaseServerClient();

  const { data } = await client
    .from('associations')
    .select(
      'id, cash_ledger_enabled, accounts!inner(slug), association_feature_flags(feature, enabled)',
    )
    .eq('accounts.slug', accountSlug)
    .maybeSingle();

  const enabled = new Set<string>(
    (data?.association_feature_flags ?? [])
      .filter((flag) => flag.enabled)
      .map((flag) => flag.feature),
  );

  return {
    cashLedgerEnabled: data?.cash_ledger_enabled !== false,
    isEnabled: (feature: AssociationFeature) => enabled.has(feature),
  };
});
