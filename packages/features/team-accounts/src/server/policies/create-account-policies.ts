import 'server-only';
import { allow, definePolicy, deny } from '@kit/policies';
import { createPolicyRegistry } from '@kit/policies';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import type { FeaturePolicyCreateAccountContext } from './feature-policy-create-account-context';

/**
 * Feature-specific registry for create account policies.
 */
export const createAccountPolicyRegistry = createPolicyRegistry();

/**
 * Super-admin-only account creation.
 *
 * New associations are onboarded by the platform operator, not self-served by
 * whoever happens to verify a phone number — regular users only ever get
 * access to an association by being invited into it. Without this, any
 * uninvited phone number could create (and become admin of) its own
 * association the moment it signs in.
 */
export const superAdminOnlyAccountCreationPolicy =
  definePolicy<FeaturePolicyCreateAccountContext>({
    id: 'super-admin-only-account-creation',
    stages: ['preliminary', 'submission'],
    evaluate: async () => {
      const client = getSupabaseServerClient();
      const { data: isSuperAdmin } = await client.rpc('is_super_admin');

      if (!isSuperAdmin) {
        return deny({
          code: 'SUPER_ADMIN_REQUIRED',
          message: 'teams.policyErrors.superAdminRequired',
          remediation: 'teams.policyRemediation.superAdminRequired',
        });
      }

      return allow();
    },
  });

createAccountPolicyRegistry.registerPolicy(superAdminOnlyAccountCreationPolicy);
