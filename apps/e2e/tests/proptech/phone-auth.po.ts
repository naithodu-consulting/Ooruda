import { type Page, expect } from '@playwright/test';

/**
 * Page object for the PropTech phone-OTP sign-in flow.
 *
 * Mirrors `PhoneOtpSignInContainer`: a phone step (10-digit national number,
 * +91 prefix added by the app) followed by a 6-digit OTP step.
 *
 * Seeded dev users (see `supabase/seeds/seed_test_users.sh`) all use OTP
 * `123456`. To run locally the Supabase project must accept those as test
 * OTPs — add to `apps/web/supabase/config.toml`:
 *
 *   [auth.sms]
 *   enable_signup = true
 *
 *   [auth.sms.test_otp]
 *   919911000001 = "123456"   # ... through 919911000006
 *
 * and start the app with NEXT_PUBLIC_MOCK_OTP=true.
 */
export const PHONE_USERS = {
  ASSOC_ADMIN: '9911000001',
  BILLING_OPERATOR: '9911000002',
  PROP_OWNER: '9911000003',
  TENANT: '9911000005',
  SUPER_ADMIN: '9911000006',
} as const;

export const TEST_OTP = '123456';

export class PhoneAuthPageObject {
  constructor(private readonly page: Page) {}

  goToSignIn(next?: string) {
    return this.page.goto(`/auth/sign-in${next ? `?next=${next}` : ''}`);
  }

  /** Fill the national number and request an OTP. */
  async requestOtp(nationalNumber: string) {
    await this.page.fill('[data-test="phone-input"]', nationalNumber);
    await this.page.click('[data-test="phone-send-otp-button"]');
  }

  /** Enter the OTP into the segmented input and submit. */
  async submitOtp(otp: string) {
    // shadcn InputOTP exposes a single hidden input marked `data-input-otp`.
    await this.page.fill('[data-input-otp]', otp);
    await this.page.click('[data-test="otp-verify-button"]');
  }

  /** Full happy-path sign-in. */
  async signIn(nationalNumber: string, otp: string = TEST_OTP) {
    await this.goToSignIn();
    await this.requestOtp(nationalNumber);

    // The OTP step renders only after the OTP request resolves.
    await expect(this.page.locator('[data-test="otp-input"]')).toBeVisible();

    await this.submitOtp(otp);
  }
}
