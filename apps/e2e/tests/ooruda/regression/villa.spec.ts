import { type Browser, type Page, expect, test } from '@playwright/test';

import {
  authFile,
  expectNoErrorBoundary,
  measureOverflow,
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

// M3a: a random 2-night stay in 2030 (clear of real data and of other runs).
function ymdPlus(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const STAY_IN = ymdPlus('2030-02-01', Math.floor(Math.random() * 300));
const STAY_OUT = ymdPlus(STAY_IN, 2);
let bookingCode = '';

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

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Picks 'YYYY-MM-DD' in the app's DatePicker (react-day-picker dropdowns). */
async function pickDate(page: Page, trigger: string, ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];

  await page.click(`[data-test="${trigger}"]`);
  // Scope to the calendar just opened (always last in the DOM): an earlier
  // picker's calendar can still be mounted.
  await page
    .locator('select[aria-label="Choose the Year"]')
    .last()
    .selectOption(String(y));
  await page
    .locator('select[aria-label="Choose the Month"]')
    .last()
    .selectOption(String(m - 1));
  await page
    .locator('[role="grid"]')
    .last()
    .getByRole('button', {
      name: new RegExp(`${MONTHS[m - 1]} ${d}(st|nd|rd|th)?, ${y}`),
    })
    .click();
}

function sidebar(page: Page) {
  return page.locator('[data-sidebar="sidebar"]').first();
}

test.describe.serial('villa product (M0)', () => {
  // Always release the booking-site property, even when a test above failed:
  // a site property may be linked to only one villa account, so a leftover
  // link would block every later run.
  test.afterAll(async ({ browser }) => {
    if (!VILLA_SITE.key) return;

    const context = await browser.newContext({
      storageState: authFile('superAdmin'),
    });
    const page = await context.newPage();

    try {
      await openAdminAccount(page, VILLA_NAME);
      const button = page.locator(
        '[data-test="admin-disconnect-villa-site-button"]',
      );

      if ((await button.count()) > 0) {
        await button.first().click();
        await page.click('[data-test="admin-disconnect-villa-site-confirm"]');
        await expect(page.getByText('Booking site disconnected')).toBeVisible();
      }
    } finally {
      await context.close();
    }
  });

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

  test('villa owner manages villa settings', async ({ browser }) => {
    test.skip(!VILLA_SITE.key, 'VILLA_DB_TEST_SERVICE_ROLE_KEY not set');

    const page = await signedInPage(browser, VILLA_OWNER.phone);
    const issues = watchPage(page);

    await page.goto(VILLA_HOME);
    await settle(page);
    await sidebar(page).getByRole('link', { name: 'Villa Settings' }).click();
    await page.waitForURL(/\/villa-settings/);
    await settle(page);

    // Rates & guests: live values from the booking site, in plain words.
    await expect(
      page.locator('[data-test="villa-rates-weekdayNightly"]'),
    ).not.toHaveValue('');
    // The ₹ fields are real labelled inputs (label → input, for screen readers).
    await expect(page.getByLabel('Weekday nights')).not.toHaveValue('');
    await expect(page.getByLabel('Ideal for (guests)')).not.toHaveValue('');
    await expect(
      page.locator('[data-test="villa-rates-extras-summary"]'),
    ).toContainText('each per night');
    await expect(page.locator('[data-test="villa-rates-save"]')).toBeDisabled();

    // Seasonal rates: add one far in the future, then remove it.
    await page.click('[data-test="villa-settings-tab-seasonal"]');
    await page.fill('[data-test="villa-seasonal-name"]', `E2E rate ${STAMP}`);
    await pickDate(page, 'villa-seasonal-first', '2030-12-20');
    await pickDate(page, 'villa-seasonal-last', '2030-12-22');
    await page.fill('[data-test="villa-seasonal-rate"]', '15500');
    await page.click('[data-test="villa-seasonal-submit"]');
    await expect(page.getByText('Seasonal rate added')).toBeVisible();

    const rule = page.locator('[data-test="villa-seasonal-row"]', {
      hasText: `E2E rate ${STAMP}`,
    });
    await expect(rule).toContainText('3 nights');
    await expect(rule).toContainText('15,500');
    await rule.locator('[data-test="villa-seasonal-delete"]').click();
    await page.click('[data-test="villa-seasonal-delete-confirm"]');
    await expect(rule).toHaveCount(0);

    // Add-on.
    await page.click('[data-test="villa-settings-tab-addons"]');
    await page.click('[data-test="villa-addon-new"]');
    await page.fill('[data-test="villa-addon-name"]', 'Extra bed');
    await page.fill('[data-test="villa-addon-price"]', '1000');
    await page.click('[data-test="villa-addon-save"]');
    await expect(
      page.locator('[data-test="villa-addon-row"]', { hasText: 'Extra bed' }),
    ).toContainText('per night');

    // Emergency contact, normalised to E.164 and tap-to-call.
    await page.click('[data-test="villa-settings-tab-contacts"]');
    await page.click('[data-test="villa-contact-new"]');
    await page.fill('[data-test="villa-contact-name"]', 'Caretaker Ramesh');
    await page.fill('[data-test="villa-contact-phone"]', '9876543210');
    await page.click('[data-test="villa-contact-save"]');
    const contact = page.locator('[data-test="villa-contact-row"]', {
      hasText: 'Caretaker Ramesh',
    });
    await expect(
      contact.locator('[data-test="villa-contact-call"]'),
    ).toHaveAttribute('href', 'tel:+919876543210');

    // Policies: managers may cancel.
    await page.click('[data-test="villa-settings-tab-policies"]');
    await expect(
      page.locator('[data-test="villa-policies-retention"]'),
    ).toContainText('30 days');
    await page.click('[data-test="villa-policies-managers-cancel"]');
    await page.click('[data-test="villa-policies-save"]');
    await expect(page.getByText('Settings saved')).toBeVisible();

    // Phone width: no horizontal overflow.
    const overflow = await measureOverflow(page, 360);
    expect(
      overflow.docOverflow,
      overflow.offenders.join(' | '),
    ).toBeLessThanOrEqual(0);

    expect(issues.serverErrors).toEqual([]);
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
    await expect(
      nav.getByRole('link', { name: 'Villa Settings' }),
    ).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Members' })).toHaveCount(0);

    expect(issues.serverErrors).toEqual([]);
    await page.context().close();
  });

  test('villa manager sees villa settings read-only', async ({ browser }) => {
    test.skip(!VILLA_SITE.key, 'VILLA_DB_TEST_SERVICE_ROLE_KEY not set');

    const page = await signedInPage(browser, VILLA_MANAGER.phone);

    await page.goto(`${VILLA_HOME}/villa-settings`);
    await settle(page);

    await expect(
      page.locator('[data-test="villa-settings-read-only"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-test="villa-rates-weekdayNightly"]'),
    ).toBeDisabled();
    await expect(page.locator('[data-test="villa-rates-save"]')).toHaveCount(0);

    await page.click('[data-test="villa-settings-tab-contacts"]');
    await expect(
      page.locator('[data-test="villa-contact-row"]', {
        hasText: 'Caretaker Ramesh',
      }),
    ).toBeVisible();
    await expect(page.locator('[data-test="villa-contact-new"]')).toHaveCount(
      0,
    );

    await page.click('[data-test="villa-settings-tab-addons"]');
    await expect(page.locator('[data-test="villa-addon-new"]')).toHaveCount(0);

    await page.context().close();
  });

  test('villa owner records a phone booking with a live quote', async ({
    browser,
  }) => {
    test.skip(!VILLA_SITE.key, 'VILLA_DB_TEST_SERVICE_ROLE_KEY not set');

    const page = await signedInPage(browser, VILLA_OWNER.phone);
    const issues = watchPage(page);

    await page.goto(VILLA_HOME);
    await settle(page);
    await sidebar(page).getByRole('link', { name: 'Bookings' }).click();
    await page.waitForURL(/\/bookings/);
    await settle(page);

    await page.click('[data-test="villa-booking-new"]');
    await pickDate(page, 'villa-booking-checkin', STAY_IN);
    await pickDate(page, 'villa-booking-checkout', STAY_OUT);
    await page.fill('[data-test="villa-booking-adults"]', '4');

    // Live availability + price from the booking site.
    await expect(
      page.locator('[data-test="villa-booking-quote"]'),
    ).toContainText('Available');
    await expect(
      page.locator('[data-test="villa-booking-total"]'),
    ).toContainText('₹');

    await page.fill('[data-test="villa-booking-name"]', `E2E Guest ${STAMP}`);
    await page.fill('[data-test="villa-booking-phone"]', '9876543210');
    await page.click('[data-test="villa-booking-submit"]');

    // Lands on the new booking, titled with its site-issued code.
    await page.waitForURL(/\/bookings\/[0-9a-f-]{36}/);
    await settle(page);
    await expect(page.locator('[data-test="villa-booking-status"]')).toHaveText(
      'Confirmed',
    );
    bookingCode = (await page.locator('h1').first().innerText()).trim();
    expect(bookingCode).toMatch(/^[A-Z][A-Z0-9]{1,3}-[0-9A-Z]{3}-[0-9A-Z]{3}$/);

    // Listed under Upcoming.
    await page.goto(`${VILLA_HOME}/bookings?view=upcoming`);
    await settle(page);
    await expect(
      page.locator(
        `[data-test="villa-booking-row"][data-booking-code="${bookingCode}"]`,
      ),
    ).toBeVisible();

    // Staff can type the code any way: lower case, no hyphens.
    await page.fill(
      '[data-test="villa-bookings-search"]',
      bookingCode.toLowerCase().replace(/-/g, ''),
    );
    await page.click('[data-test="villa-bookings-search-submit"]');
    await page.waitForURL(/\/bookings\/[0-9a-f-]{36}/);
    await expect(page.locator('[data-test="villa-booking-guest"]')).toHaveText(
      `E2E Guest ${STAMP}`,
    );

    expect(issues.serverErrors).toEqual([]);
    await page.context().close();
  });

  test('villa manager cancels the booking with a reason', async ({
    browser,
  }) => {
    test.skip(!VILLA_SITE.key || !bookingCode, 'no booking created');

    // The owner allowed managers to cancel in the settings test above.
    const page = await signedInPage(browser, VILLA_MANAGER.phone);

    await page.goto(`${VILLA_HOME}/bookings?q=${bookingCode}`);
    await page.waitForURL(/\/bookings\/[0-9a-f-]{36}/);
    await settle(page);

    await page.click('[data-test="villa-booking-cancel-open"]');
    await page.click('[data-test="villa-booking-cancel-reason"]');
    await page.click('[data-test="villa-cancel-reason-guest_change_of_plans"]');
    await page.fill(
      '[data-test="villa-booking-cancel-note"]',
      'Guest called to cancel',
    );
    await page.click('[data-test="villa-booking-cancel-confirm"]');

    await expect(page.locator('[data-test="villa-booking-status"]')).toHaveText(
      'Cancelled',
    );
    await expect(
      page.locator('[data-test="villa-booking-activity"]'),
    ).toContainText('Reason: Guest changed plans');
    await expect(
      page.locator('[data-test="villa-booking-cancel-open"]'),
    ).toHaveCount(0);

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
  test('super-admin disconnects the booking site; settings are kept', async ({
    browser,
  }) => {
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

    // Unlinked, not deleted: the property stays, ready to be reconnected.
    const row = card.locator('[data-test="admin-villa-site-row"]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Disconnected');
    await expect(
      row.locator('[data-test="admin-reconnect-villa-site-button"]'),
    ).toBeVisible();
    await context.close();

    // The owner's add-ons and contacts survive the disconnect.
    const owner = await signedInPage(browser, VILLA_OWNER.phone);
    await owner.goto(`${VILLA_HOME}/villa-settings?tab=addons`);
    await settle(owner);
    await expect(
      owner.locator('[data-test="villa-addon-row"]', { hasText: 'Extra bed' }),
    ).toBeVisible();

    await owner.goto(`${VILLA_HOME}/villa-settings?tab=rates`);
    await settle(owner);
    await expect(
      owner.locator('[data-test="villa-settings-site-unavailable"]'),
    ).toBeVisible();
    await owner.context().close();
  });
});
