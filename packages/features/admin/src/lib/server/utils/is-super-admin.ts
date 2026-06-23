import { SupabaseClient } from '@supabase/supabase-js';

import { Database } from '@kit/supabase/database';

/**
 * @name isSuperAdmin
 * @description Check if the current user is a super admin.
 * @param client
 */
export async function isSuperAdmin(client: SupabaseClient<Database>) {
  try {
    const { data, error } = await client.rpc('is_super_admin');

    if (error) {
      throw error;
    }

    return data;
  } catch {
    return false;
  }
}

/**
 * @name isUserSuperAdmin
 * @description Check if a given target user (by id) is a Super Admin, via
 * their `app_metadata.role`. Used to block destructive/role-altering admin
 * actions against other Super Admin accounts. Fails closed: if the lookup
 * errors, the caller should treat the action as not permitted.
 */
export async function isUserSuperAdmin(
  adminClient: SupabaseClient<Database>,
  userId: string,
) {
  const { data, error } = await adminClient.auth.admin.getUserById(userId);

  if (error || !data.user) {
    throw new Error(`Error fetching user`);
  }

  return data.user.app_metadata?.role === 'super-admin';
}
