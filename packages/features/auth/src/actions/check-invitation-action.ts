'use server';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

export async function checkPhoneInvitationAction(phone: string) {
  const adminClient = getSupabaseServerAdminClient();

  const cleanPhone = phone.replace('+', ''); // e.g., '919911000001'
  const plusPhone = `+${cleanPhone}`; // e.g., '+919911000001'
  const tenDigitPhone = cleanPhone.slice(-10); // e.g., '9911000001'

  // 1. Check if user already exists in public.profiles (since every authenticated user has a profile)
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('id')
    .or(`mobile_number.eq.${plusPhone},mobile_number.eq.${cleanPhone}`)
    .maybeSingle();

  if (profileError) {
    console.error('Profile check error:', profileError.message);
  }

  if (profile) {
    return { allowed: true, shouldCreateUser: false };
  }

  // 2. Check if user has a pending, unexpired invitation for this phone number
  const { data: invitation, error: invitationError } = await adminClient
    .from('invitations')
    .select('id')
    .or(
      `phone.eq.${plusPhone},phone.eq.${cleanPhone},phone.eq.${tenDigitPhone}`,
    )
    .gte('expires_at', new Date().toISOString())
    .maybeSingle();

  if (invitationError) {
    console.error('Invitation check error:', invitationError.message);
  }

  if (invitation) {
    return { allowed: true, shouldCreateUser: true };
  }

  return { allowed: false, shouldCreateUser: false };
}
