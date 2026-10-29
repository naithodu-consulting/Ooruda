import { test } from '@playwright/test';

import {
  ROLES,
  type RoleKey,
  authFile,
  passAccessGate,
  signIn,
} from './helpers';

// Sign each role in once and reuse the session across the suite. Serial, so
// the local Auth server isn't hit with several code requests at once.
test.describe.configure({ mode: 'serial', timeout: 240_000 });

for (const [index, role] of (Object.keys(ROLES) as RoleKey[]).entries()) {
  test(`sign in as ${role}`, async ({ browser, baseURL }) => {
    // proxy.ts rate-limits sign-in submissions per client IP (from
    // x-forwarded-for locally); a distinct address per role keeps a full
    // suite run well clear of it.
    const context = await browser.newContext({
      extraHTTPHeaders: { 'x-forwarded-for': `10.0.0.${index + 10}` },
    });
    // The early-access gate redirects every route to /access, sign-in
    // included, so the cookie has to be in place before the first navigation.
    await passAccessGate(context, baseURL);

    const page = await context.newPage();
    await signIn(page, ROLES[role].phone);
    await context.storageState({ path: authFile(role) });
    await context.close();
  });
}
