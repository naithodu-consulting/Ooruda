import type { BaseRates, PricingRule } from '~/lib/villa-db/rates';

/** What the settings page could read from the villa's booking site. */
export type SiteState =
  | { status: 'ok'; rates: BaseRates; rules: PricingRule[] }
  | { status: 'not_configured' | 'unreachable' | 'inactive' | 'error' };
