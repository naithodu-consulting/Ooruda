import 'server-only';
import { getLogger } from '@kit/shared/logger';

import { getVillaSite } from '~/lib/villa-db/client';
import { isVillaDbError } from '~/lib/villa-db/errors';
import { getBaseRates, listPricingRules } from '~/lib/villa-db/rates';

import type { SiteState } from '../types';

/** Rates and seasonal rules from the booking site, or why they are missing. */
export async function loadSiteSettings(
  accountId: string,
  propertyId: string,
): Promise<SiteState> {
  try {
    const site = await getVillaSite(accountId, propertyId);
    const [rates, rules] = await Promise.all([
      getBaseRates(site),
      listPricingRules(site),
    ]);

    return { status: 'ok', rates, rules };
  } catch (error) {
    const code = isVillaDbError(error) ? error.code : 'UNKNOWN';

    if (code === 'NOT_CONFIGURED') return { status: 'not_configured' };
    if (code === 'INACTIVE') return { status: 'inactive' };

    const logger = await getLogger();
    logger.warn(
      {
        propertyId,
        code,
        detail: isVillaDbError(error) ? error.detail : String(error),
      },
      'villa settings: booking site read failed',
    );

    return code === 'UNREACHABLE'
      ? { status: 'unreachable' }
      : { status: 'error' };
  }
}
