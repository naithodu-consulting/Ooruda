'use server';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

/**
 * @name checkEmailLoginAction
 * @description Gate for the secondary email-OTP login channel.
 *
 * Email is a fallback for users who ALREADY exist (provisioned via phone by an
 * admin or a phone invitation). It never creates a new account, so this only
 * reports whether the email belongs to an existing user - it always returns
 * `shouldCreateUser: false`.
 *
 * Note: like the phone gate (`checkPhoneInvitationAction`, which returns
 * `not_invited`), an unregistered email surfaces an explicit
 * `email_not_registered` message rather than a silent no-op. This is a
 * deliberate UX choice for an invite-only B2B app - it is a mild
 * account-existence oracle, accepted for consistency with the phone channel.
 */
export async function checkEmailLoginAction(email: string) {
  const adminClient = getSupabaseServerAdminClient();

  const normalized = email.trim().toLowerCase();

  // profiles.email mirrors auth.users.email and is the canonical lookup.
  const { data: profile, error } = await adminClient
    .from('profiles')
    .select('id')
    .eq('email', normalized)
    .maybeSingle();

  if (error) {
    console.error('Email login check error:', error.message);
  }

  return { allowed: !!profile, shouldCreateUser: false as const };
}
