import 'server-only';
import { cache } from 'react';

import { redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { createTeamAccountsApi } from '@kit/team-accounts/api';

import pathsConfig from '~/config/paths.config';
import { getAccountContext } from '~/lib/rbac';
import { ROLE_HIERARCHY_LEVEL_BY_ROLE } from '~/lib/roles';
import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

export type TeamAccountWorkspace = Awaited<
  ReturnType<typeof loadTeamWorkspace>
>;

/**
 * Load the account workspace data.
 * We place this function into a separate file so it can be reused in multiple places across the server components.
 *
 * This function is used in the layout component for the account workspace.
 * It is cached so that the data is only fetched once per request.
 *
 * @param accountSlug
 */
export const loadTeamWorkspace = cache(workspaceLoader);

async function workspaceLoader(accountSlug: string) {
  const client = getSupabaseServerClient();
  const api = createTeamAccountsApi(client);

  const [workspace, user, { data: isSuperAdmin }] = await Promise.all([
    api.getAccountWorkspace(accountSlug),
    requireUserInServerComponent(),
    client.rpc('is_super_admin'),
  ]);

  if (isSuperAdmin) {
    // A super-admin acts as the top role of the workspace's product
    // (assoc_admin or villa_owner). Request-cached; shared with requireRole.
    const { role: superAdminRole } = await getAccountContext(accountSlug);
    const actingRole = superAdminRole ?? 'assoc_admin';

    if (!workspace.data?.account) {
      // Super admin isn't a member, so fetch account directly
      const { data: rawAccount } = await client
        .from('accounts')
        .select('id, name, picture_url, slug, primary_owner_user_id')
        .eq('slug', accountSlug)
        .single();

      if (!rawAccount) return redirect(pathsConfig.app.home);

      const { data: accounts } = await client.from('user_accounts').select('*');

      workspace.data = {
        account: {
          id: rawAccount.id,
          name: rawAccount.name,
          picture_url: rawAccount.picture_url || '',
          slug: rawAccount.slug || '',
          primary_owner_user_id: rawAccount.primary_owner_user_id || '',
          role: actingRole,
          role_hierarchy_level: ROLE_HIERARCHY_LEVEL_BY_ROLE[actingRole],
          subscription_status: 'active',
          permissions: [],
        } as any, // Cast to avoid complex type matching
        accounts: (accounts as any) ?? [],
      };
    } else {
      // Super admin is a member, but upgrade role for UI full access
      workspace.data.account.role = actingRole;
    }
  } else if (!workspace.data?.account) {
    // Normal user, not a member
    return redirect(pathsConfig.app.home);
  }

  return {
    ...(workspace.data as NonNullable<typeof workspace.data>),
    user,
  };
}
