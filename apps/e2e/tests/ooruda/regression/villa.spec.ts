import { type Browser, type Page, expect, test } from '@playwright/test';

import {
  authFile,
  expectNoErrorBoundary,
  settle,
  signIn,
  uniqueClientIp,
  watchPage,
} from './helpers';

/**
 * Ooruda Villa M0 — a villa account beside the association accounts.
 *
 * Covers the product gate end to end: super-admin creates a villa account,
 * the villa owner sees only the villa workspace, association pages bounce back
 * to the villa home, the owner invites a villa manager, the manager sees the
 * narrower nav, and the owner's other (association) membership still works.
 *
 * Test users (supabase/config.toml test OTPs) are tenants in the PSM
 * association already, which also exercises one person holding memberships
 * in both products.
 */

const VILLA_OWNER = { phone: '9999999972', name: 'RAGHAVENDRA' };
const VILLA_MANAGER = { phone: '9999999973' };
const OWNER_ASSOCIATION = '/home/t-psm-commercial-complex-owners-association';

// Unique per run: account slugs are derived from the name.
const STAMP = Date.now().toString(36);
const VILLA_NAME = `E2E Villa ${STAMP}`;
const VILLA_SLUG = `e2e-villa-${STAMP}`;
const VILLA_HOME = `/home/${VILLA_SLUG}`;

// M1: the local villa-booking stack (only ever a local database). The key is
// that stack's default service key, supplied by the environment, never
// committed. Without it the booking-site connection tests are skipped.
const VILLA_SITE = {
  url: process.env.VILLA_DB_TEST_URL ?? 'http://127.0.0.1:54331',
  key: process.env.VILLA_DB_TEST_SERVICE_ROLE_KEY,
  slug: process.env.VILLA_DB_TEST_PROPERTY_SLUG ?? 'villa-19',
};

async function signedInPage(browser: Browser, phone: string): Promise<Page> {
  const context = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': uniqueClientIp() },
  });
  const page = await context.newPage();
  await signIn(page, phone);
  return page;
}

/**
 * The admin accounts list pages 10 at a time and every run adds a villa, so
 * filter by name rather than assume the row is on the first page.
 */
async function findAdminAccountRow(page: Page, name: string) {
  await page.fill('[data-test="admin-accounts-table-filter-input"]', name);
  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toHaveCount(1);
  return row;
}

async function openAdminAccount(page: Page, name: string) {
  await page.goto('/admin/accounts');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  const row = await findAdminAccountRow(page, name);
  // Navigate by href: the filter is debounced, and a click that lands while
  // the table re-renders can hit a replaced element and go nowhere.
  const href = await row.getByRole('link', { name }).getAttribute('href');
  expect(href).toMatch(/^\/admin\/accounts\/[0-9a-f-]{36}$/);
  await page.goto(href!);
}

function sidebar(page: Page) {
  return page.locator('[data-sidebar="sidebar"]').first();
}

test.describe.serial('villa product (M0)', () => {
  test('super-admin creates a villa account', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: authFile('superAdmin'),
    });
    const page = await context.newPage();
    const issues = watchPage(page);

    // Admin pages have no <h1>, so settle() does not apply here.
    await page.goto('/admin/accounts');
    await page.waitForLoadState('networkidle').catch(() => undefined);

    await page.click('[data-test="admin-create-association-button"]');

    // Account type → Villa
    await page.click('[data-test="admin-account-product-select"]');
    await page.getByRole('option', { name: 'Villa' }).click();

    const form = page.locator('[data-test="admin-create-association-form"]');
    await expect(form.getByText('Villa name')).toBeVisible();
    await form.locator('input[name="name"]').fill(VILLA_NAME);

    await page.click('[data-test="admin-association-owner-select"]');
    await page
      .locator('[data-test="admin-association-owner-select-search"]')
      .fill(VILLA_OWNER.name);
    await page.getByRole('option', { name: VILLA_OWNER.name }).first().click();

    await form.getByRole('button', { name: 'Create Villa Account' }).click();
    await expect(
      page.getByText('Villa account created successfully'),
    ).toBeVisible();

    // Listed with a Villa badge.
    const row = await findAdminAccountRow(page, VILLA_NAME);
    await expect(
      row.locator('[data-test="admin-account-villa-badge"]'),
    ).toBeVisible();

    expect(issues.serverErrors).toEqual([]);
    await context.close();
  });

  test('villa owner sees only the villa workspace', async ({ browser }) => {
    const page = await signedInPage(browser, VILLA_OWNER.phone);
    const issues = watchPage(page);

    await page.goto(VILLA_HOME);
    await settle(page);
    await expectNoErrorBoundary(page);

    await expect(
      page.locator('[data-test="villa-dashboard-setup"]'),
    ).toBeVisible();
    await expect(page.locator('[data-test="villa-dashboard-role"]')).toHaveText(
      'Villa Owner',
    );

    const nav = sidebar(page);
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Members' })).toBeVisible();
    for (const hidden of ['Billing', 'Units', 'Electricity', 'Payments']) {
      await expect(nav.getByRole('link', { name: hidden })).toHaveCount(0);
    }

    // M1: not linked to a booking site yet.
    await expect(
      page.locator('[data-test="villa-site-status-none"]'),
    ).toBeVisible();

    // Association pages bounce back to the villa home (no loop, no crash).
    for (const path of ['billing', 'units', 'payments', 'electricity']) {
      await page.goto(`${VILLA_HOME}/${path}`);
      await page.waitForURL(new RegExp(`${VILLA_HOME}$`));
      await expect(
        page.locator('[data-test="villa-dashboard-setup"]'),
      ).toBeVisible();
    }

    expect(issues.serverErrors).toEqual([]);
    await page.context().close();
  });

  test('super-admin connects the villa to its booking site', async ({
    browser,
  }) => {
    test.skip(!VILLA_SITE.key, 'VILLA_DB_TEST_SERVICE_ROLE_KEY not set');

    const context = await browser.newContext({
      storageState: authFile('superAdmin'),
    });
    const page = await context.newPage();
    const issues = watchPage(page);

    await openAdminAccount(page, VILLA_NAME);

    const card = page.locator('[data-test="admin-villa-sites"]');
    await expect(card).toBeVisible();
    await expect(card.getByText('Not connected yet')).toBeVisible();

    // A wrong slug is caught before anything is saved.
    await card.locator('[data-test="admin-connect-villa-site-button"]').click();
    await page.fill('[data-test="admin-villa-site-url"]', VILLA_SITE.url);
    await page.fill('[data-test="admin-villa-site-key"]', VILLA_SITE.key!);
    await page.fill('[data-test="admin-villa-site-slug"]', 'no-such-villa');
    await page.click('[data-test="admin-villa-site-submit"]');
    await expect(page.getByText('No property with slug')).toBeVisible();

    await page.fill('[data-test="admin-villa-site-slug"]', VILLA_SITE.slug);
    await page.click('[data-test="admin-villa-site-submit"]');
    await expect(page.getByText('Booking site connected')).toBeVisible();

    const row = card.locator('[data-test="admin-villa-site-row"]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Key stored');
    // The key itself is never rendered back.
    await expect(page.locator('body')).not.toContainText(VILLA_SITE.key!);

    expect(issues.serverErrors).toEqual([]);
    await context.close();
  });

  test('villa owner sees the booking site connected', async ({ browser }) => {
    test.skip(!VILLA_SITE.key, 'VILLA_DB_TEST_SERVICE_ROLE_KEY not set');

    const page = await signedInPage(browser, VILLA_OWNER.phone);

    await page.goto(VILLA_HOME);
    await settle(page);

    const status = page.locator('[data-test="villa-site-status-row"]');
    await expect(status).toHaveCount(1);
    await expect(status).toHaveAttribute('data-status', 'connected');
    await expect(status).toContainText('Connected');

    await page.context().close();
  });

  test('villa owner invites a villa manager with villa roles only', async ({
    browser,
  }) => {
    const page = await signedInPage(browser, VILLA_OWNER.phone);
    const issues = watchPage(page);

    await page.goto(`${VILLA_HOME}/members`);
    await settle(page);

    await page.click('[data-test="invite-members-form-trigger"]');
    await page.click('[data-test="role-selector-trigger"]');

    await expect(
      page.locator('[data-test="role-option-villa_manager"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-test="role-option-villa_owner"]'),
    ).toBeVisible();
    for (const role of [
      'assoc_admin',
      'billing_operator',
      'prop_owner',
      'tenant',
    ]) {
      await expect(
        page.locator(`[data-test="role-option-${role}"]`),
      ).toHaveCount(0);
    }

    await page.click('[data-test="role-option-villa_manager"]');
    await page.fill('[data-test="invite-phone-input"]', VILLA_MANAGER.phone);
    await page
      .locator('[data-test="invite-members-form"]')
      .getByRole('button', { name: 'Send Invites' })
      .click();

    // The manager already has an Ooruda login, so they are added directly.
    await expect(
      page.locator('[data-test="member-role-badge"]', {
        hasText: 'Villa Manager',
      }),
    ).toBeVisible({ timeout: 20_000 });

    expect(issues.serverErrors).toEqual([]);
    await page.context().close();
  });

  test('villa manager gets the narrower villa nav', async ({ browser }) => {
    const page = await signedInPage(browser, VILLA_MANAGER.phone);
    const issues = watchPage(page);

    await page.goto(VILLA_HOME);
    await settle(page);

    await expect(
      page.locator('[data-test="villa-dashboard-setup"]'),
    ).toBeVisible();
    await expect(page.locator('[data-test="villa-dashboard-role"]')).toHaveText(
      'Villa Manager',
    );
    await expect(
      page.locator('[data-test="villa-dashboard-invite-manager"]'),
    ).toHaveCount(0);

    const nav = sidebar(page);
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Members' })).toHaveCount(0);

    expect(issues.serverErrors).toEqual([]);
    await page.context().close();
  });

  test("villa owner's association membership is unaffected", async ({
    browser,
  }) => {
    const page = await signedInPage(browser, VILLA_OWNER.phone);
    const issues = watchPage(page);

    await page.goto(OWNER_ASSOCIATION);
    await settle(page);
    await expectNoErrorBoundary(page);

    await expect(
      page.locator('[data-test="villa-dashboard-setup"]'),
    ).toHaveCount(0);
    await expect(
      sidebar(page).getByRole('link', { name: 'Payments' }),
    ).toBeVisible();

    expect(issues.serverErrors).toEqual([]);
    await page.context().close();
  });

  test('association admin is never offered villa roles', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: authFile('admin'),
    });
    const page = await context.newPage();

    await page.goto('/home/sandbox-residency-test/members');
    await settle(page);

    await page.click('[data-test="invite-members-form-trigger"]');
    await page.click('[data-test="role-selector-trigger"]');

    await expect(
      page.locator('[data-test="role-option-tenant"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-test="role-option-villa_owner"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-test="role-option-villa_manager"]'),
    ).toHaveCount(0);

    await context.close();
  });

  // Last: releases the site property so the next run can connect it again
  // (a site property may be linked to only one villa account).
  test('super-admin disconnects the booking site', async ({ browser }) => {
    test.skip(!VILLA_SITE.key, 'VILLA_DB_TEST_SERVICE_ROLE_KEY not set');

    const context = await browser.newContext({
      storageState: authFile('superAdmin'),
    });
    const page = await context.newPage();

    await openAdminAccount(page, VILLA_NAME);

    const card = page.locator('[data-test="admin-villa-sites"]');
    await card
      .locator('[data-test="admin-disconnect-villa-site-button"]')
      .click();
    await page.click('[data-test="admin-disconnect-villa-site-confirm"]');

    await expect(page.getByText('Booking site disconnected')).toBeVisible();
    await expect(
      card.locator('[data-test="admin-villa-site-row"]'),
    ).toHaveCount(0);
    await expect(card.getByText('Not connected yet')).toBeVisible();

    await context.close();
  });
});
