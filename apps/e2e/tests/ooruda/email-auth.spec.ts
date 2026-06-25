import { expect, test } from '@playwright/test';

import { EMAIL_USERS, EmailAuthPageObject } from './email-auth.po';

/**
 * Ooruda secondary email-OTP authentication flows.
 *
 * Prerequisites to run:
 *   - local Supabase running (Mailpit captures the OTP email on port 54324)
 *   - dev users seeded via supabase/seeds/seed_test_users.sh (each has a
 *     synthetic <phone>@ooruda.test email)
 *   - email provider enabled (config.toml wires the OTP template)
 *
 * Email is a secondary channel for users who already exist; it never creates
 * an account.
 */
test.describe('email-otp sign in', () => {
  test('rejects an invalid email client-side (no OTP requested)', async ({
    page,
  }) => {
    const auth = new EmailAuthPageObject(page);
    await auth.goToSignIn();
    await auth.switchToEmail();

    await auth.requestOtp('not-an-email');

    // Still on the email step — the OTP input never appears.
    await expect(page.locator('[data-test="otp-input"]')).toHaveCount(0);
    await expect(page.locator('[data-test="email-input"]')).toBeVisible();
  });

  test('an unregistered email is blocked (no account enumeration into the app)', async ({
    page,
  }) => {
    const auth = new EmailAuthPageObject(page);
    await auth.goToSignIn();
    await auth.switchToEmail();

    await auth.requestOtp('nobody@ooruda.test');

    // The gate denies an email with no account; we never reach the OTP step.
    await expect(
      page.locator('[data-test="auth-error-message"]'),
    ).toBeVisible();
    await expect(page.locator('[data-test="otp-input"]')).toHaveCount(0);
  });

  test('an existing user signs in with an email OTP', async ({ page }) => {
    const auth = new EmailAuthPageObject(page);

    await auth.signIn(EMAIL_USERS.ASSOC_ADMIN);

    await page.waitForURL('**/home/**');
    expect(page.url()).not.toContain('/auth/sign-in');
  });

  test('toggling back to phone restores the phone step', async ({ page }) => {
    const auth = new EmailAuthPageObject(page);
    await auth.goToSignIn();
    await auth.switchToEmail();

    await page.click('[data-test="use-phone-instead"]');

    await expect(page.locator('[data-test="phone-input"]')).toBeVisible();
    await expect(page.locator('[data-test="email-input"]')).toHaveCount(0);
  });
});
