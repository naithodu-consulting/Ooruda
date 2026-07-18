'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const COOKIE_NAME = 'ooruda_access';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export async function submitAccessPin(_prev: unknown, formData: FormData) {
  const pin = (formData.get('pin') as string | null)?.trim() ?? '';
  const next = (formData.get('next') as string | null) ?? '/auth/sign-in';

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
