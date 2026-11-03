import type { BaseRates, PricingRule, RateGroup } from '~/lib/villa-db/rates';

/** What the settings page could read from the villa's booking site. */
export type SiteState =
  | {
      status: 'ok';
      rates: BaseRates;
      rules: PricingRule[];
      /** The rules as named rates — what the calendar edits. */
      groups: RateGroup[];
    }
  | { status: 'not_configured' | 'unreachable' | 'inactive' | 'error' };
