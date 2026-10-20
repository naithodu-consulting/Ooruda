import { test } from '@playwright/test';

import { ROLES, type RoleKey, authFile, signIn } from './helpers';

// Sign each role in once and reuse the session across the suite. Serial, so
// the local Auth server isn't hit with several code requests at once.
test.describe.configure({ mode: 'serial', timeout: 240_000 });

for (const [index, role] of (Object.keys(ROLES) as RoleKey[]).entries()) {
  test(`sign in as ${role}`, async ({ browser }) => {
    // proxy.ts rate-limits sign-in submissions per client IP (from
    // x-forwarded-for locally); a distinct address per role keeps a full
    // suite run well clear of it.
    const context = await browser.newContext({
      extraHTTPHeaders: { 'x-forwarded-for': `10.0.0.${index + 10}` },
    });
    const page = await context.newPage();
    await signIn(page, ROLES[role].phone);
    await context.storageState({ path: authFile(role) });
    await context.close();
  });
}
