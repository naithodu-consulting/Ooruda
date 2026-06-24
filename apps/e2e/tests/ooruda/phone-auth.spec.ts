import { expect, test } from '@playwright/test';

import { PHONE_USERS, PhoneAuthPageObject, TEST_OTP } from './phone-auth.po';

/**
 * Ooruda phone-OTP authentication flows.
 *
 * Prerequisites to run (see phone-auth.po.ts for full config):
 *   - local Supabase running with [auth.sms.test_otp] for 919911000001..6
 *   - dev users seeded via supabase/seeds/seed_test_users.sh into
 *     the `abish-association` team account
 *   - app served with NEXT_PUBLIC_MOCK_OTP=true
 *
 * These tests sign in fresh each time (no stored auth state) because the
 * point under test is the OTP flow and its post-login routing.
 */
test.describe('phone-otp sign in', () => {
  test('rejects an invalid phone number client-side (no OTP requested)', async ({
    page,
  }) => {
    const auth = new PhoneAuthPageObject(page);
    await auth.goToSignIn();

    // 5xxxxxxxxx fails the /^[6-9]\d{9}$/ rule enforced by the form.
    await auth.requestOtp('5123456789');

    // Still on the phone step — the OTP input never appears.
    await expect(page.locator('[data-test="otp-input"]')).toHaveCount(0);
    await expect(page.locator('[data-test="phone-input"]')).toBeVisible();
  });

  test('advances to the OTP step for a valid number', async ({ page }) => {
    const auth = new PhoneAuthPageObject(page);
    await auth.goToSignIn();

    await auth.requestOtp(PHONE_USERS.ASSOC_ADMIN);

    await expect(page.locator('[data-test="otp-input"]')).toBeVisible();
    // The resend control is gated behind a cooldown immediately after sending.
    await expect(
      page.locator('[data-test="resend-otp-button"]'),
    ).toBeDisabled();
  });

  test('an association admin lands inside their association after sign in', async ({
    page,
  }) => {
    const auth = new PhoneAuthPageObject(page);

    await auth.signIn(PHONE_USERS.ASSOC_ADMIN, TEST_OTP);

    // Regular members are routed into the team workspace, never the platform
    // admin console.
    await page.waitForURL('**/home/**');
    expect(page.url()).not.toContain('/auth/sign-in');
    expect(page.url()).not.toContain('/admin');
  });

  test('the platform super admin is routed to /admin', async ({ page }) => {
    const auth = new PhoneAuthPageObject(page);

    await auth.signIn(PHONE_USERS.SUPER_ADMIN, TEST_OTP);

    // Per the super-admin redirect: no association membership → /admin, not
    // the create-association onboarding.
    await page.waitForURL('**/admin**');
    expect(page.url()).toContain('/admin');
  });

  test('a wrong OTP keeps the user on the verification step', async ({
    page,
  }) => {
    const auth = new PhoneAuthPageObject(page);
    await auth.goToSignIn();
    await auth.requestOtp(PHONE_USERS.TENANT);

    await expect(page.locator('[data-test="otp-input"]')).toBeVisible();
    await auth.submitOtp('000000');

    // Verification failed → still on the OTP step, not signed in.
    await expect(page.locator('[data-test="otp-verify-button"]')).toBeVisible();
    expect(page.url()).toContain('/auth/sign-in');
  });
});
