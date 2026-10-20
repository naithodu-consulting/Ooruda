import * as z from 'zod';

export const FeatureFlagSchema = z.object({
  associationId: z.string().uuid(),
  feature: z.enum(['expense_tracker', 'amc_reminder']),
  enabled: z.boolean(),
});

export type FeatureFlagInput = z.infer<typeof FeatureFlagSchema>;
