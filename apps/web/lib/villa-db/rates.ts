import 'server-only';
import { fromPaise, toPaise } from '~/lib/villa/money';

import type { VillaSite } from './client';
import { nightsIn } from './dates';
import {
  VillaDbError,
  fromSiteError,
  fromSiteWriteError,
  invalidAmount,
} from './errors';
import { withSyncLog } from './sync-log';

/**
 * Rates on the villa-booking database (integration contract §6). The guest
 * site's pricing engine reads these, so a phone quote and an online quote
 * come from the same numbers. Values are exposed to Ooruda in rupees.
 */

export interface BaseRates {
  /** Sunday–Thursday nights. */
  weekdayNightly: number;
  /** Friday and Saturday nights. */
  weekendNightly: number;
  /** Per guest, per night, above the included guests. */
  extraGuestRate: number;
  /** Second extra-guest tier, if the property uses tiered pricing. */
  extraGuestTier2Rate: number | null;
  /** Guests included in the nightly rate (children count, infants do not). */
  includedGuests: number;
  idealOccupancy: number | null;
  maxGuests: number;
  checkInTime: string | null;
  checkOutTime: string | null;
}

export interface PricingRule {
  id: string;
  name: string;
  startDate: string;
  /** Exclusive: the night of endDate gets the normal rate. */
  endDate: string;
  /** Rupees; replaces both weekday and weekend rates for covered nights. */
  nightlyRate: number;
  minStayNights: number;
}

export async function getBaseRates(site: VillaSite): Promise<BaseRates> {
  const { data, error } = await site.client
    .from('properties')
    .select(
      'base_nightly_rate, weekend_nightly_rate, extra_guest_rate, extra_guest_tier2_rate, base_occupancy, ideal_occupancy, max_occupancy, check_in_time, check_out_time',
    )
    .eq('id', site.sitePropertyId)
    .maybeSingle();

  if (error) throw fromSiteError(error);
  if (!data)
    throw new VillaDbError('NOT_FOUND', `site property ${site.sitePropertyId}`);

  return {
    weekdayNightly: fromPaise(data.base_nightly_rate),
    weekendNightly: fromPaise(data.weekend_nightly_rate),
    extraGuestRate: fromPaise(data.extra_guest_rate),
    extraGuestTier2Rate:
      data.extra_guest_tier2_rate == null
        ? null
        : fromPaise(data.extra_guest_tier2_rate),
    includedGuests: data.base_occupancy,
    idealOccupancy: data.ideal_occupancy ?? null,
    maxGuests: data.max_occupancy,
    checkInTime: data.check_in_time,
    checkOutTime: data.check_out_time,
  };
}

function toRule(row: {
  id: string;
  rule_name: string;
  start_date: string;
  end_date: string;
  nightly_rate: number;
  min_stay_nights: number | null;
}): PricingRule {
  return {
    id: row.id,
    name: row.rule_name,
    startDate: row.start_date,
    endDate: row.end_date,
    nightlyRate: fromPaise(row.nightly_rate),
    minStayNights: row.min_stay_nights ?? 1,
  };
}

export async function listPricingRules(
  site: VillaSite,
): Promise<PricingRule[]> {
  const { data, error } = await site.client
    .from('pricing_rules')
    .select(
      'id, rule_name, start_date, end_date, nightly_rate, min_stay_nights',
    )
    .eq('property_id', site.sitePropertyId)
    .order('start_date');

  if (error) throw fromSiteError(error);

  return (data ?? []).map(toRule);
}

/**
 * Adds a seasonal/holiday rate for [startDate, endDate). Refuses overlaps:
 * with two rules on one night, checkout and the homepage widget can pick
 * different ones and the guest is charged a price they were not shown.
 *
 * The check and the insert are two requests; the villa-booking repo is to
 * add an exclusion constraint that closes the race (its TODO, item 2).
 */
export async function createPricingRule(
  site: VillaSite,
  input: {
    name: string;
    startDate: string;
    endDate: string;
    nightlyRate: number | string;
    minStayNights?: number;
  },
  actorUserId: string | null,
): Promise<PricingRule> {
  nightsIn(input.startDate, input.endDate);

  const name = input.name.trim();

  if (!name || name.length > 150) {
    throw new VillaDbError(
      'INVALID_INPUT',
      'rule name',
      'Give the rate a name (up to 150 characters).',
    );
  }

  let rate: number;

  try {
    rate = toPaise(input.nightlyRate);
  } catch {
    throw invalidAmount('the nightly rate');
  }

  if (rate <= 0) {
    throw new VillaDbError(
      'INVALID_INPUT',
      'rate must be positive',
      'The nightly rate must be more than zero.',
    );
  }

  const minStay = input.minStayNights ?? 1;

  if (!Number.isInteger(minStay) || minStay < 1) {
    throw new VillaDbError(
      'INVALID_INPUT',
      'min stay',
      'Minimum stay must be at least 1 night.',
    );
  }

  return withSyncLog(site, 'rate_rule.create', actorUserId, async () => {
    const { data: clashes, error: clashError } = await site.client
      .from('pricing_rules')
      .select('rule_name')
      .eq('property_id', site.sitePropertyId)
      .lt('start_date', input.endDate)
      .gt('end_date', input.startDate);

    if (clashError) throw fromSiteError(clashError);

    if (clashes && clashes.length > 0) {
      throw new VillaDbError(
        'OVERLAP',
        `overlaps ${clashes.map((c) => c.rule_name).join(', ')}`,
        `These dates overlap "${clashes[0]!.rule_name}". Change the dates or remove that rate first.`,
      );
    }

    const { data, error } = await site.client
      .from('pricing_rules')
      .insert({
        property_id: site.sitePropertyId,
        rule_name: name,
        start_date: input.startDate,
        end_date: input.endDate,
        nightly_rate: rate,
        min_stay_nights: minStay,
      })
      .select(
        'id, rule_name, start_date, end_date, nightly_rate, min_stay_nights',
      )
      .single();

    if (error) throw fromSiteWriteError(error);

    return { result: toRule(data), siteId: data.id };
  });
}

export async function deletePricingRule(
  site: VillaSite,
  ruleId: string,
  actorUserId: string | null,
): Promise<void> {
  await withSyncLog(site, 'rate_rule.delete', actorUserId, async () => {
    const { data, error } = await site.client
      .from('pricing_rules')
      .delete()
      .eq('id', ruleId)
      .eq('property_id', site.sitePropertyId)
      .select('id');

    if (error) throw fromSiteWriteError(error);
    if (!data || data.length === 0)
      throw new VillaDbError('NOT_FOUND', `rule ${ruleId}`);

    return { result: undefined, siteId: ruleId };
  });
}
