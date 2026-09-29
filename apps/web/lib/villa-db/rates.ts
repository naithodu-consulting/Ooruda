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
  /**
   * Optional second tier: guests numbered `extraGuestTier2From` and above pay
   * `extraGuestTier2Rate` instead. Both set or both null (site constraint).
   */
  extraGuestTier2Rate: number | null;
  extraGuestTier2From: number | null;
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
      'base_nightly_rate, weekend_nightly_rate, extra_guest_rate, extra_guest_tier2_rate, extra_guest_tier2_from, base_occupancy, ideal_occupancy, max_occupancy, check_in_time, check_out_time',
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
    extraGuestTier2From: data.extra_guest_tier2_from ?? null,
    includedGuests: data.base_occupancy,
    idealOccupancy: data.ideal_occupancy ?? null,
    maxGuests: data.max_occupancy,
    checkInTime: data.check_in_time,
    checkOutTime: data.check_out_time,
  };
}

export interface BaseRatesInput {
  weekdayNightly: number | string;
  weekendNightly: number | string;
  extraGuestRate: number | string;
  extraGuestTier2Rate: number | string | null;
  extraGuestTier2From: number | null;
  includedGuests: number;
  maxGuests: number;
  /** Site copy ("Ideal for N–max guests") and the booking form's default. */
  idealGuests: number;
  /** 'HH:MM' (24-hour). */
  checkInTime: string;
  checkOutTime: string;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function rupeesToPaise(value: number | string, field: string): number {
  let paise: number;

  try {
    paise = toPaise(value);
  } catch {
    throw invalidAmount(field);
  }

  if (paise < 0) throw invalidAmount(field);

  return paise;
}

/**
 * Validates base rates against the guest site's own rules, so an owner gets
 * a clear message instead of a database constraint error. Pure; exported for
 * tests. Returns the paise row to write.
 */
export function validateBaseRates(input: BaseRatesInput) {
  const reject = (message: string): never => {
    throw new VillaDbError('INVALID_INPUT', message, message);
  };

  const weekday = rupeesToPaise(input.weekdayNightly, 'the weekday rate');
  const weekend = rupeesToPaise(input.weekendNightly, 'the weekend rate');
  const extra = rupeesToPaise(input.extraGuestRate, 'the extra guest rate');

  if (weekday === 0 || weekend === 0) {
    reject('Nightly rates must be more than zero.');
  }

  const { includedGuests: included, maxGuests: max } = input;

  if (!Number.isInteger(included) || included < 1 || included > 100) {
    reject('Guests included must be a whole number from 1 to 100.');
  }

  if (!Number.isInteger(max) || max < included || max > 100) {
    reject('Maximum guests must be at least the guests included.');
  }

  if (
    !Number.isInteger(input.idealGuests) ||
    input.idealGuests < 1 ||
    input.idealGuests > max
  ) {
    reject('"Ideal for" must be between 1 and the maximum guests.');
  }

  const hasTier2Rate =
    input.extraGuestTier2Rate !== null && input.extraGuestTier2Rate !== '';
  const hasTier2From = input.extraGuestTier2From !== null;

  if (hasTier2Rate !== hasTier2From) {
    reject(
      'Set both the second-tier rate and the guest it starts from, or neither.',
    );
  }

  let tier2Rate: number | null = null;
  let tier2From: number | null = null;

  if (hasTier2Rate && hasTier2From) {
    tier2Rate = rupeesToPaise(
      input.extraGuestTier2Rate!,
      'the second-tier rate',
    );
    tier2From = input.extraGuestTier2From!;

    // Site constraint properties_extra_guest_tier2_valid.
    if (
      !Number.isInteger(tier2From) ||
      tier2From <= included + 1 ||
      tier2From > max
    ) {
      reject(
        `The second tier must start after guest ${included + 1} and no later than guest ${max}.`,
      );
    }
  }

  if (!HHMM.test(input.checkInTime) || !HHMM.test(input.checkOutTime)) {
    reject('Enter check-in and check-out times as HH:MM.');
  }

  return {
    base_nightly_rate: weekday,
    weekend_nightly_rate: weekend,
    extra_guest_rate: extra,
    extra_guest_tier2_rate: tier2Rate,
    extra_guest_tier2_from: tier2From,
    base_occupancy: included,
    max_occupancy: max,
    ideal_occupancy: input.idealGuests,
    check_in_time: `${input.checkInTime}:00`,
    check_out_time: `${input.checkOutTime}:00`,
  };
}

/**
 * Saves base rates, occupancy and check-in/out times on the guest site.
 * They apply to NEW bookings at once; existing bookings keep their amounts
 * (contract §6.1).
 */
export async function updateBaseRates(
  site: VillaSite,
  input: BaseRatesInput,
  actorUserId: string | null,
): Promise<BaseRates> {
  const row = validateBaseRates(input);

  await withSyncLog(site, 'rates.update', actorUserId, async () => {
    const { data, error } = await site.client
      .from('properties')
      .update(row)
      .eq('id', site.sitePropertyId)
      .select('id');

    if (error) throw fromSiteWriteError(error);
    if (!data || data.length === 0) {
      throw new VillaDbError(
        'NOT_FOUND',
        `site property ${site.sitePropertyId}`,
      );
    }

    return { result: undefined, siteId: site.sitePropertyId };
  });

  return getBaseRates(site);
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
