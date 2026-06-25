import { type Page, expect } from '@playwright/test';

import { Mailbox } from '../utils/mailbox';

/**
 * Page object for the secondary email-OTP sign-in flow.
 *
 * Mirrors the email branch of `PhoneOtpSignInContainer`: a channel toggle
 * ("Use email instead") reveals an email step, followed by the shared 6-digit
 * OTP step. Locally, Supabase routes the OTP email to Mailpit (port 54324),
 * from which we read the code.
 *
 * Seeded dev users have synthetic emails `<phone>@ooruda.test` (see
 * `supabase/seeds/seed_test_users.sh`). Requires the local Supabase stack
 * running and the app started with the email provider enabled.
 */
export const EMAIL_USERS = {
  ASSOC_ADMIN: '919911000001@ooruda.test',
  BILLING_OPERATOR: '919911000002@ooruda.test',
  PROP_OWNER: '919911000003@ooruda.test',
  TENANT: '919911000005@ooruda.test',
} as const;

export class EmailAuthPageObject {
  private readonly mailbox: Mailbox;

  constructor(private readonly page: Page) {
    this.mailbox = new Mailbox(page);
  }

  goToSignIn(next?: string) {
    return this.page.goto(`/auth/sign-in${next ? `?next=${next}` : ''}`);
  }

  /** Switch from the default phone channel to the email channel. */
  async switchToEmail() {
    await this.page.click('[data-test="use-email-instead"]');
    await expect(this.page.locator('[data-test="email-input"]')).toBeVisible();
  }

  async requestOtp(email: string) {
    await this.page.fill('[data-test="email-input"]', email);
    await this.page.click('[data-test="email-send-otp-button"]');
  }

  async submitOtp(otp: string) {
    await this.page.fill('[data-input-otp]', otp);
    await this.page.click('[data-test="otp-verify-button"]');
  }

  /** Read the 6-digit code from the OTP email in Mailpit. */
  async getOtpFromEmail(email: string) {
    const json = await this.mailbox.getEmail(email, {
      deleteAfter: true,
      subject: 'Your sign-in code',
    });

    const code = json?.HTML?.match(/\b(\d{6})\b/)?.[1];

    if (!code) {
      throw new Error('Could not find a 6-digit code in the sign-in email');
    }

    return code;
  }

  /** Full happy-path email sign-in. */
  async signIn(email: string) {
    await this.goToSignIn();
    await this.switchToEmail();
    await this.requestOtp(email);

    await expect(this.page.locator('[data-test="otp-input"]')).toBeVisible();

    await expect(async () => {
      const otp = await this.getOtpFromEmail(email);
      await this.submitOtp(otp);
    }).toPass();
  }
}
