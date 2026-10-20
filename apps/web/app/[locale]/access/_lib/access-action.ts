'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getSafeRedirectPath } from '@kit/shared/utils';

const COOKIE_NAME = 'ooruda_access';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export async function submitAccessPin(_prev: unknown, formData: FormData) {
  const pin = (formData.get('pin') as string | null)?.trim() ?? '';
  // `next` arrives from the ?next= query string via a hidden field, so it is
  // attacker-controlled. Validate it or /access?next=https://evil.example
  // redirects the visitor off-site the moment they enter a correct PIN.
  const next = getSafeRedirectPath(
    formData.get('next') as string | null,
    '/auth/sign-in',
  );

  const correctPin = process.env.ACCESS_PIN;

  if (!correctPin || pin !== correctPin) {
    return { error: 'Incorrect access code. Please try again.' };
  }

  const jar = await cookies();

  jar.set(COOKIE_NAME, '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });

  redirect(next);
}
