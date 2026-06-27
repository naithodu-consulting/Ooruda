'use client';

import { useEffect, useEffectEvent } from 'react';

import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

import { useSupabase } from './use-supabase';

/**
 * @name PRIVATE_PATH_PREFIXES
 * @description A list of private path prefixes
 */
const PRIVATE_PATH_PREFIXES = [
  '/home',
  '/admin',
  '/join',
  '/identities',
  '/update-password',
];

/**
 * @name AUTH_PATHS
 * @description A list of auth paths
 */
const AUTH_PATHS = ['/auth'];

// Module-level guard: prevents the auth listener from triggering a
// navigation more than once within REDIRECT_COOLDOWN_MS. This breaks the
// infinite-reload loop that occurs when Supabase fires repeated SIGNED_OUT
// events (e.g. due to a race between cookie refresh and client state).
const REDIRECT_COOLDOWN_MS = 5_000;
let lastRedirectAt = 0;

/**
 * @name useAuthChangeListener
 * @param privatePathPrefixes - A list of private path prefixes
 * @param appHomePath - The path to redirect to when the user is signed out
 * @param onEvent - Callback function to be called when an auth event occurs
 */
export function useAuthChangeListener({
  privatePathPrefixes = PRIVATE_PATH_PREFIXES,
  onEvent,
}: {
  privatePathPrefixes?: string[];
  onEvent?: (event: AuthChangeEvent, user: Session | null) => void;
}) {
  const client = useSupabase();

  const setupAuthListener = useEffectEvent(() => {
    // don't run on the server
    if (typeof window === 'undefined') {
      return;
    }

    // keep this running for the whole session unless the component was unmounted
    return client.auth.onAuthStateChange((event, user) => {
      const pathName = window.location.pathname;

      if (onEvent) {
        onEvent(event, user);
      }

      // log user out if user is falsy
      // and if the current path is a private route
      const shouldRedirectUser =
        !user && isPrivateRoute(pathName, privatePathPrefixes);

      if (shouldRedirectUser) {
        const now = Date.now();

        // Guard against rapid repeated redirects (e.g. a refresh-token race
        // that causes Supabase to fire SIGNED_OUT → SIGNED_IN in quick
        // succession). If we already redirected recently, skip this one.
        if (now - lastRedirectAt < REDIRECT_COOLDOWN_MS) {
          return;
        }

        lastRedirectAt = now;

        // send user away when signed out
        window.location.assign('/');

        return;
      }

      // revalidate user session when user signs in or out
      if (event === 'SIGNED_OUT') {
        // sometimes Supabase sends SIGNED_OUT event
        // but in the auth path, so we ignore it
        if (AUTH_PATHS.some((path) => pathName.startsWith(path))) {
          return;
        }

        window.location.reload();
      }
    });
  });

  useEffect(() => {
    const listener = setupAuthListener();

    // destroy listener on un-mounts
    return () => {
      listener?.data.subscription.unsubscribe();
    };
  }, []);
}

/**
 * Determines if a given path is a private route.
 */
function isPrivateRoute(path: string, privatePathPrefixes: string[]) {
  return privatePathPrefixes.some((prefix) => path.startsWith(prefix));
}
