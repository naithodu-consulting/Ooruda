'use server';

import { isSuperAdmin } from '@kit/admin';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { invalidateChannelCache } from '~/lib/notify';

export interface NotificationChannelStatus {
  channel: string;
  providerKey: string;
  isActive: boolean;
}

export async function getNotificationSettingsAction(): Promise<
  NotificationChannelStatus[]
> {
  const client = getSupabaseServerClient();
  if (!(await isSuperAdmin(client))) {
    throw new Error('Unauthorized');
  }

  const adminClient = getSupabaseServerAdminClient();
  const { data } = await adminClient
    .from('notification_providers_config')
    .select('channel, provider_key, is_active')
    .is('association_id', null)
    .order('channel')
    .order('priority', { ascending: false });

  // Deduplicate: keep the highest-priority row per channel in case of data anomalies
  const seen = new Set<string>();
  const deduped = (data ?? []).filter((r) => {
    if (seen.has(r.channel)) return false;
    seen.add(r.channel);
    return true;
  });

  return deduped.map((r) => ({
    channel: r.channel,
    providerKey: r.provider_key,
    isActive: r.is_active,
  }));
}

export async function toggleNotificationChannelAction(
  channel: string,
  isActive: boolean,
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseServerClient();
  if (!(await isSuperAdmin(client))) {
    return { success: false, error: 'Unauthorized' };
  }

  const adminClient = getSupabaseServerAdminClient();
  const { error } = await adminClient
    .from('notification_providers_config')
    .update({ is_active: isActive })
    .eq('channel', channel)
    .is('association_id', null);

  if (error) return { success: false, error: error.message };

  // Clear the in-process channel cache so the next notification picks up the new value
  invalidateChannelCache();

  return { success: true };
}
