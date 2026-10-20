import { expect, test } from '@playwright/test';

import { PHONE_USERS, PhoneAuthPageObject } from './phone-auth.po';

/**
 * Ooruda association settings - the one fully-implemented domain surface.
 *
 * Covers the assoc_admin editing branding / GSTIN / MESCOM / billing defaults
 * (the `updateAssociationAction` server action) and the role gate that hides
 * the edit capability from non-admins.
 *
 * Prerequisites match phone-auth.spec.ts (seeded users, test OTP, mock OTP).
 * The association slug is the seed default `abish-association`.
 */
const ASSOCIATION_SLUG = 'abish-association';
const SETTINGS_PATH = `/home/${ASSOCIATION_SLUG}/settings/association`;

test.describe('association settings (assoc_admin)', () => {
  test.beforeEach(async ({ page }) => {
    const auth = new PhoneAuthPageObject(page);
    await auth.signIn(PHONE_USERS.ASSOC_ADMIN);
    await page.waitForURL('**/home/**');
  });

  test('persists GSTIN, MESCOM number and billing defaults', async ({
    page,
  }) => {
    await page.goto(SETTINGS_PATH);

    const gstin = '29ABCDE1234F1Z5';
    const consumerNo = `MES-${Date.now().toString().slice(-6)}`;

    await page.fill('input[name="gstin"]', gstin);
    await page.fill('input[name="mescom_consumer_no"]', consumerNo);
    await page.fill('input[name="due_day_of_month"]', '15');
    await page.fill('input[name="minimum_electricity_charge"]', '250');

    await page.getByRole('button', { name: 'Save Changes' }).click();

    await expect(page.getByText('Settings saved.')).toBeVisible();

    // Values survive a reload → they were written, not just echoed.
    await page.reload();
    await expect(page.locator('input[name="gstin"]')).toHaveValue(gstin);
    await expect(page.locator('input[name="mescom_consumer_no"]')).toHaveValue(
      consumerNo,
    );
    await expect(page.locator('input[name="due_day_of_month"]')).toHaveValue(
      '15',
    );
  });

  test('rejects a malformed GSTIN with the server-side error', async ({
    page,
  }) => {
    await page.goto(SETTINGS_PATH);

    await page.fill('input[name="gstin"]', 'NOT-A-VALID-GSTIN');
    await page.getByRole('button', { name: 'Save Changes' }).click();

    await expect(
      page.getByText('Invalid form data. Check GSTIN format.'),
    ).toBeVisible();
  });
});

test.describe('association settings (non-admin)', () => {
  test('a tenant cannot reach the association settings page', async ({
    page,
  }) => {
    const auth = new PhoneAuthPageObject(page);
    await auth.signIn(PHONE_USERS.TENANT);
    await page.waitForURL('**/home/**');

    await page.goto(SETTINGS_PATH);

    // requireRole redirects non-admins away from the admin-only settings page.
    await expect(page).not.toHaveURL(new RegExp(`${SETTINGS_PATH}$`));
  });
});
