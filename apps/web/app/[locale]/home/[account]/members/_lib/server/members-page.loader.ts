import 'server-only';
import { SupabaseClient } from '@supabase/supabase-js';

import { loadTeamWorkspace } from '~/home/[account]/_lib/server/team-account-workspace.loader';
import { Database } from '~/lib/database.types';

import { loadAssocAdminPermissions } from './assoc-permissions.loader';

/**
 * Load data for the members page
 * @param client
 * @param slug
 */
export async function loadMembersPageData(
  client: SupabaseClient<Database>,
  slug: string,
) {
  const workspaceData = await loadTeamWorkspace(slug);
  const { account } = workspaceData;

  const [members, invitations, canAdd, assocPermissions] = await Promise.all([
    loadAccountMembers(client, slug),
    loadInvitations(client, slug),
    canAddMember(),
    loadAssocAdminPermissions(client, account.id),
  ]);

  return [
    members,
    invitations,
    canAdd,
    workspaceData,
    assocPermissions,
  ] as const;
}

/**
 * @name canAddMember
 * @description Check if the current user can add a member to the account
 *
 * This needs additional logic to determine if the user can add a member to the account
 * Please implement the logic and return a boolean value
 *
 * The same check needs to be added when creating an invitation
 *
 */
async function canAddMember() {
  return Promise.resolve(true);
}

/**
 * Load account members
 * @param client
 * @param account
 */
async function loadAccountMembers(
  client: SupabaseClient<Database>,
  account: string,
) {
  const { data, error } = await client.rpc('get_account_members', {
    account_slug: account,
  });

  if (error) {
    throw error;
  }

  const members = data ?? [];

  // This app is phone-OTP only, so members have no email to show. We surface
  // the phone number from `profiles.mobile_number` instead. Reading co-members'
  // profiles relies on the `profiles_read_account_members` RLS policy.
  const userIds = members.map((member) => member.user_id);
  const phoneByUserId = new Map<string, string | null>();

  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await client
      .from('profiles')
      .select('id, mobile_number')
      .in('id', userIds);

    if (profilesError) {
      // non-fatal — phone numbers degrade to null; log for visibility
      console.warn(
        '[members-loader] profiles query failed:',
        profilesError.message,
      );
    }

    for (const profile of profiles ?? []) {
      phoneByUserId.set(profile.id, profile.mobile_number);
    }
  }

  return members.map((member) => ({
    ...member,
    phone: phoneByUserId.get(member.user_id) ?? null,
  }));
}

/**
 * Load account invitations
 * @param client
 * @param account
 */
async function loadInvitations(
  client: SupabaseClient<Database>,
  account: string,
) {
  const { data, error } = await client.rpc('get_account_invitations', {
    account_slug: account,
  });

  if (error) {
    throw error;
  }

  return data ?? [];
}
