import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getLogger } from '@kit/shared/logger';

import type { FeatureFlagInput } from '../schema/feature-flags.schema';

export function createFeatureFlagsService(client: SupabaseClient) {
  return new FeatureFlagsService(client);
}

class FeatureFlagsService {
  constructor(private readonly client: SupabaseClient) {}

  async upsertFlag(actorId: string, input: FeatureFlagInput) {
    const logger = await getLogger();

    logger.info(
      {
        associationId: input.associationId,
        feature: input.feature,
        enabled: input.enabled,
      },
      'admin: toggling feature flag',
    );

    const { error } = await (this.client as any)
      .from('association_feature_flags')
      .upsert(
        {
          association_id: input.associationId,
          feature: input.feature,
          enabled: input.enabled,
          enabled_at: input.enabled ? new Date().toISOString() : null,
          enabled_by: input.enabled ? actorId : null,
        },
        { onConflict: 'association_id,feature' },
      );

    if (error) {
      logger.error({ error }, 'admin: failed to toggle feature flag');
      throw error;
    }

    logger.info(
      { associationId: input.associationId, feature: input.feature },
      'admin: feature flag toggled',
    );
  }

  async getFlags(associationId: string) {
    const { data } = await (this.client as any)
      .from('association_feature_flags')
      .select('feature, enabled')
      .eq('association_id', associationId);

    const map: Record<string, boolean> = {};
    for (const row of data ?? []) {
      map[row.feature as string] = row.enabled as boolean;
    }

    return {
      expense_tracker: map['expense_tracker'] ?? false,
      amc_reminder: map['amc_reminder'] ?? false,
    };
  }
}
