import type {
  AuthError,
  SignInWithPasswordlessCredentials,
} from '@supabase/supabase-js';

import { useMutation } from '@tanstack/react-query';

import { useSupabase } from './use-supabase';

export function useSignInWithOtp() {
  const client = useSupabase();
  const mutationKey = ['auth', 'sign-in-with-otp'];

  const mutationFn = async (credentials: SignInWithPasswordlessCredentials) => {
    const result = await client.auth.signInWithOtp(credentials);

    if (result.error) {
      if (shouldIgnoreError(result.error, credentials)) {
        console.warn(
          `Ignoring error during development: ${result.error.message}`,
        );

        return {} as never;
      }

      throw result.error.message;
    }

    return result.data;
  };

  return useMutation({
    mutationFn,
    mutationKey,
  });
}

export default useSignInWithOtp;

function shouldIgnoreError(
  error: AuthError,
  credentials: SignInWithPasswordlessCredentials,
) {
  if (isSmsProviderNotSetupError(error.message)) {
    return true;
  }

  // On the sign-in path (shouldCreateUser === false), GoTrue returns an
  // "otp_disabled" / "Signups not allowed for otp" error for a non-existent
  // account but succeeds for an existing one - an account-enumeration oracle.
  // Swallow it ONLY when not creating a user so the UX is identical regardless
  // of whether the account exists. The sign-up path (shouldCreateUser !== false)
  // still surfaces genuine "signups disabled" errors.
  if (
    credentials.options?.shouldCreateUser === false &&
    isOtpSignupsDisabledError(error)
  ) {
    return true;
  }

  return false;
}

function isSmsProviderNotSetupError(error: string) {
  return error.includes(`sms Provider could not be found`);
}

function isOtpSignupsDisabledError(error: AuthError) {
  return (
    error.code === 'otp_disabled' ||
    error.message.includes('Signups not allowed for otp')
  );
}
