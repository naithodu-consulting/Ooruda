type IntervalUnit = 'day' | 'week' | 'month' | 'year';

interface GetSubscriptionIntervalTypeParams {
  /**
   * The variant's configured billing interval. This is stable plan metadata
   * (sourced from `getVariant`) and is the authoritative source for the
   * interval - unlike the renewal date, it does not drift as renewal nears.
   */
  variantInterval?: IntervalUnit | null;
  /**
   * The variant's configured interval count, e.g. `2` for "every 2 months".
   */
  variantIntervalCount?: number | null;
  /**
   * The subscription's next renewal date. Used only as a lossy fallback when
   * the variant interval is unavailable (see `getIntervalFromRenewalDate`).
   */
  renewsAt?: string | null;
}

/**
 * @name getSubscriptionIntervalType
 * @description Resolve a subscription's billing interval.
 *
 * Lemon Squeezy does not expose a reliable interval field on the subscription
 * object, and `billing_anchor` is a day-of-month (1-31), not an interval count.
 * The variant, however, carries the configured billing interval - stable plan
 * metadata that we prefer. When it is unavailable we fall back to inferring the
 * interval from the distance to the next renewal date, which is inherently
 * lossy near renewal but better than nothing.
 */
export function getSubscriptionIntervalType(
  params: GetSubscriptionIntervalTypeParams,
) {
  // Prefer the variant's configured billing interval. This is stable metadata
  // that stays correct regardless of how close the subscription is to renewal.
  //
  // The kit's billing config models `month`/`year` plans only
  // (`BillingIntervalSchema`), and downstream consumers (Zod plan resolution,
  // i18n labels) assume those two values - so we intentionally ignore other
  // units (`day`/`week`) and let the renewal-date fallback pick month/year.
  if (params.variantInterval === 'month' || params.variantInterval === 'year') {
    return {
      interval: params.variantInterval,
      intervalCount: normalizeIntervalCount(params.variantIntervalCount),
    };
  }

  // Fallback: infer the interval from the gap to `renews_at`. This is lossy -
  // an annual plan within ~32 days of renewal is indistinguishable from a
  // monthly plan - so it is only used when variant metadata is missing.
  return getIntervalFromRenewalDate(params.renewsAt);
}

/**
 * @name normalizeIntervalCount
 * @description Coerce a variant interval count into a positive integer.
 *
 * The DB column is `interval_count integer not null check (interval_count > 0)`
 * and the upsert casts the value with `::integer`, so a non-positive value
 * (`0`, negative) would fail the CHECK and a fractional value (`1.5`) would
 * fail the integer cast - either aborts the upsert. Fall back to `1` for any
 * value that isn't a positive integer.
 */
function normalizeIntervalCount(intervalCount?: number | null) {
  if (typeof intervalCount !== 'number' || !Number.isFinite(intervalCount)) {
    return 1;
  }

  const truncated = Math.trunc(intervalCount);

  return truncated > 0 ? truncated : 1;
}

/**
 * @name getIntervalFromRenewalDate
 * @description Infer the billing interval from the distance to the renewal
 * date. Lossy near renewal; kept only as a fallback for
 * {@link getSubscriptionIntervalType}.
 */
function getIntervalFromRenewalDate(renewsAt?: string | null) {
  // Without a renewal date we cannot infer anything; default to a monthly
  // interval, matching the historical behaviour of this heuristic.
  if (!renewsAt) {
    return {
      interval: 'month',
      intervalCount: 1,
    };
  }

  const renewalDate = new Date(renewsAt);
  const currentDate = new Date();

  // Calculate the difference in milliseconds
  const timeDifference = renewalDate.getTime() - currentDate.getTime();

  // Convert milliseconds to days
  const daysDifference = timeDifference / (1000 * 3600 * 24);

  if (daysDifference <= 32) {
    return {
      interval: 'month',
      intervalCount: 1,
    };
  }

  return {
    interval: 'year',
    intervalCount: 1,
  };
}
