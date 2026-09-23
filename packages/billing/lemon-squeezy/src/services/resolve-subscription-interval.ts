import { getVariant } from '@lemonsqueezy/lemonsqueezy.js';

import { getLogger } from '@kit/shared/logger';

import { getSubscriptionIntervalType } from './subscription-interval';

const namespace = 'billing.lemon-squeezy';

/**
 * @name resolveSubscriptionInterval
 * @description Resolve a subscription's billing interval from its variant.
 *
 * Fetches the variant's configured billing interval (stable plan metadata) and
 * resolves the interval from it, preferring it over inferring the interval from
 * the renewal date - which silently misclassifies annual subscriptions as
 * monthly once they enter their final ~32 days before renewal.
 *
 * If the variant fetch fails we fall back to the (lossy) renewal-date
 * inference rather than throwing, so transient Lemon Squeezy errors don't break
 * subscription persistence or retrieval.
 */
export async function resolveSubscriptionInterval({
  variantId,
  renewsAt,
}: {
  variantId: number;
  renewsAt?: string | null;
}) {
  let variantInterval: 'day' | 'week' | 'month' | 'year' | null = null;
  let variantIntervalCount: number | null = null;

  try {
    const { data } = await getVariant(variantId);
    const attributes = data?.data.attributes;

    variantInterval = attributes?.interval ?? null;
    variantIntervalCount = attributes?.interval_count ?? null;
  } catch (error) {
    const logger = await getLogger();

    logger.warn(
      {
        variantId,
        error,
        name: namespace,
      },
      'Failed to fetch variant interval; falling back to renewal-date inference',
    );
  }

  return getSubscriptionIntervalType({
    variantInterval,
    variantIntervalCount,
    renewsAt,
  });
}
