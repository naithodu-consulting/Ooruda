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
let stayIn = STAY_IN;
let bookingCode = '';
// Delivered to the local mail catcher (Inbucket), never a real inbox.
const GUEST_EMAIL = `e2e-guest-${STAMP}@example.test`;

// M3b: three nights to block, a different year from the stay above.
const BLOCK_FIRST = ymdPlus('2031-02-01', Math.floor(Math.random() * 300));
const BLOCK_MIDDLE = ymdPlus(BLOCK_FIRST, 1);
const BLOCK_LAST = ymdPlus(BLOCK_FIRST, 2);
const SHOTS = process.env.VILLA_E2E_SHOTS;

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

    // The workspace card now lives on Bookings, not the dashboard.
    await expect(
      page.locator('[data-test="villa-dashboard-setup"]'),
    ).toHaveCount(0);
    await page.goto(`${VILLA_HOME}/bookings`);
    await settle(page);
    await expectNoErrorBoundary(page);
    await expect(
      page.locator('[data-test="villa-dashboard-setup"]'),
    ).toBeVisible();
    await expect(page.locator('[data-test="villa-dashboard-role"]')).toHaveText(
      'Villa Admin',
    );

    const nav = sidebar(page);
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Members' })).toBeVisible();
    for (const hidden of ['Billing', 'Units', 'Electricity', 'Payments']) {
      await expect(nav.getByRole('link', { name: hidden })).toHaveCount(0);
    }

    // Association pages bounce back to the villa home (no loop, no crash).
    for (const path of ['billing', 'units', 'payments', 'electricity']) {
      await page.goto(`${VILLA_HOME}/${path}`);
      await page.waitForURL(new RegExp(`${VILLA_HOME}$`));
      await expect(
        page.locator('[data-test="villa-dashboard-setup"]'),
      ).toHaveCount(0);
      await expectNoErrorBoundary(page);
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
      page.locator('[data-test="role-option-villa_admin"]'),
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

    const nav = sidebar(page);
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(
      nav.getByRole('link', { name: 'Villa Settings' }),
    ).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Members' })).toHaveCount(0);

    await page.goto(`${VILLA_HOME}/bookings`);
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
    await page.fill('[data-test="villa-booking-adults"]', '4');

    // Live availability + price from the booking site. A run that stopped
    // before its clean-up can leave a stay behind: try a few weeks later.
    const quote = page.locator('[data-test="villa-booking-quote"]');
    const quoteError = page.locator('[data-test="villa-booking-quote-error"]');

    for (let attempt = 0; attempt < 6; attempt++) {
      stayIn = ymdPlus(STAY_IN, attempt * 7);
      await pickDate(page, 'villa-booking-checkin', stayIn);
      await pickDate(page, 'villa-booking-checkout', ymdPlus(stayIn, 2));
      await expect(quote.or(quoteError)).toBeVisible();
      if (await quote.isVisible()) break;
    }

    await expect(quote).toContainText('Available');
    await expect(
      page.locator('[data-test="villa-booking-total"]'),
    ).toContainText('₹');

    await page.fill('[data-test="villa-booking-name"]', `E2E Guest ${STAMP}`);
    await page.fill('[data-test="villa-booking-phone"]', '9876543210');
    await page.fill('[data-test="villa-booking-email"]', GUEST_EMAIL);
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

  test('villa manager records a guest ID and marks IDs checked', async ({
    browser,
  }) => {
    test.skip(!VILLA_SITE.key || !bookingCode, 'no booking created');

    const uploads = process.env.VILLA_E2E_UPLOADS === 'true';
    const page = await signedInPage(browser, VILLA_MANAGER.phone);
    const issues = watchPage(page);

    await page.goto(`${VILLA_HOME}/bookings?q=${bookingCode}`);
    await page.waitForURL(/\/bookings\/[0-9a-f-]{36}/);
    await settle(page);

    const panel = page.locator('[data-test="villa-guest-ids"]');
    await expect(panel).toContainText('0 of 4 adults');

    // The first ID defaults to the lead guest who booked.
    await page.click('[data-test="villa-guest-ids-add"]');
    await expect(page.locator('[data-test="villa-add-id-name"]')).toHaveValue(
      `E2E Guest ${STAMP}`,
    );
    await page.fill('[data-test="villa-add-id-number"]', '2345 6789 0123');

    // A minimal real JPEG header: the server checks the bytes, not the name.
    await page.setInputFiles('[data-test="villa-add-id-file"]', {
      name: 'aadhaar.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from([
        0xff,
        0xd8,
        0xff,
        0xe0,
        ...Array(64).fill(0),
        0xff,
        0xd9,
      ]),
    });

    await page.click('[data-test="villa-add-id-submit"]');
    await expect(page.getByText('ID saved')).toBeVisible();

    const doc = panel.locator('[data-test="villa-guest-doc"]');
    await expect(doc).toContainText('XXXX XXXX 0123');
    await expect(panel).toContainText('1 of 4 adults');
    // The full number is never shown (nor stored).
    await expect(page.locator('body')).not.toContainText('234567890123');
    await expect(page.locator('body')).not.toContainText('2345 6789 0123');
    // Recording an ID tells the guest site it was received.
    await expect(
      page.locator('[data-test="villa-booking-id-status"]'),
    ).toHaveText('ID received');

    if (uploads) {
      const href = await doc
        .locator('[data-test="villa-guest-doc-view"]')
        .getAttribute('href');
      const view = await page.request.get(href!, { maxRedirects: 0 });
      expect(view.status()).toBe(302);
      const file = await page.request.get(view.headers()['location']!);
      expect(file.status()).toBe(200);
    }

    await page.click('[data-test="villa-guest-ids-mark-verified"]');
    await expect(
      page.locator('[data-test="villa-booking-id-status"]'),
    ).toHaveText('ID verified');
    await expect(doc).toContainText('Checked');

    await page.setViewportSize({ width: 1280, height: 900 });
    if (SHOTS) await panel.screenshot({ path: `${SHOTS}/guest-ids-1280.png` });
    const overflow = await measureOverflow(page, 360);
    expect(
      overflow.docOverflow,
      overflow.offenders.join(' | '),
    ).toBeLessThanOrEqual(0);
    if (SHOTS) await panel.screenshot({ path: `${SHOTS}/guest-ids-360.png` });

    expect(issues.serverErrors).toEqual([]);
    await page.context().close();
  });

  test('villa manager records a payment and gets a receipt number', async ({
    browser,
  }) => {
    test.skip(!VILLA_SITE.key || !bookingCode, 'no booking created');

    const page = await signedInPage(browser, VILLA_MANAGER.phone);
    const issues = watchPage(page);

    await page.goto(`${VILLA_HOME}/bookings?q=${bookingCode}`);
    await page.waitForURL(/\/bookings\/[0-9a-f-]{36}/);
    await settle(page);

    const panel = page.locator('[data-test="villa-payments"]');
    await expect(
      panel.locator('[data-test="villa-payments-status"]'),
    ).toHaveText('Unpaid');

    await page.click('[data-test="villa-payment-record"]');
    await page.fill('[data-test="villa-payment-amount"]', '5000');
    await page.fill('[data-test="villa-payment-reference"]', 'UTR-E2E');
    await page.click('[data-test="villa-payment-submit"]');
    await expect(
      page.getByText(/^Receipt [A-Z0-9]+\/RCT\/\d{4}\/\d{4}$/),
    ).toBeVisible();

    const receipt = panel.locator('[data-test="villa-payment-receipt"]');
    await expect(receipt).toHaveCount(1);
    await expect(receipt).toContainText('₹5,000');
    await expect(receipt).toContainText(/\/RCT\/\d{4}\/\d{4}/);
    await expect(
      panel.locator('[data-test="villa-payments-received"]'),
    ).toContainText('₹5,000');
    await expect(
      panel.locator('[data-test="villa-payments-status"]'),
    ).toHaveText('Part paid');
    // Refunds and voids are the owner's.
    await expect(
      panel.locator('[data-test="villa-payment-refund"]'),
    ).toHaveCount(0);

    // The receipt voucher, ready to print.
    const receiptNo = (
      await panel.locator('[data-test="villa-payment-voucher"]').innerText()
    ).trim();
    const voucherHref = await panel
      .locator('[data-test="villa-payment-voucher"]')
      .getAttribute('href');
    const voucher = await page.context().newPage();
    await voucher.goto(voucherHref!);
    await settle(voucher);
    await expect(
      voucher.locator('[data-test="villa-voucher-title"]'),
    ).toHaveText('Receipt voucher');
    await expect(
      voucher.locator('[data-test="villa-voucher-number"]'),
    ).toHaveText(receiptNo);
    await expect(
      voucher.locator('[data-test="villa-voucher-words"]'),
    ).toHaveText('Rupees Five Thousand Only');
    if (SHOTS) {
      await voucher.screenshot({
        path: `${SHOTS}/voucher.png`,
        fullPage: true,
      });
    }
    await voucher.close();
    await expect(
      page.locator('[data-test="villa-booking-payment-badge"]'),
    ).toHaveText('Part paid');

    await page.setViewportSize({ width: 1280, height: 900 });
    if (SHOTS) await panel.screenshot({ path: `${SHOTS}/payments-1280.png` });
    const overflow = await measureOverflow(page, 360);
    expect(
      overflow.docOverflow,
      overflow.offenders.join(' | '),
    ).toBeLessThanOrEqual(0);
    if (SHOTS) await panel.screenshot({ path: `${SHOTS}/payments-360.png` });

    expect(issues.serverErrors).toEqual([]);
    await page.context().close();
  });

  test('villa manager and the arrival email by hand (greyed out unless switched on)', async ({
    browser,
  }) => {
    test.skip(!VILLA_SITE.key || !bookingCode, 'no booking created');

    const page = await signedInPage(browser, VILLA_MANAGER.phone);
    const issues = watchPage(page);

    await page.goto(`${VILLA_HOME}/bookings?q=${bookingCode}`);
    await page.waitForURL(/\/bookings\/[0-9a-f-]{36}/);
    await settle(page);

    const card = page.locator('[data-test="villa-guest-emails"]');
    const pre = card.locator(
      '[data-test="villa-guest-email-pre_arrival-status"]',
    );
    // A far-future stay: scheduled for the day before, if still confirmed.
    await expect(pre).toContainText('Goes automatically');
    await expect(
      card.locator('[data-test="villa-guest-email-thank_you-status"]'),
    ).toContainText('after you check the guest out');
    await expect(
      card.locator('[data-test="villa-guest-email-thank_you-send"]'),
    ).toHaveCount(0);

    const send = card.locator(
      '[data-test="villa-guest-email-pre_arrival-send"]',
    );

    // Sending by hand is switched off unless the app runs with
    // VILLA_MANUAL_GUEST_EMAILS=true: greyed out for everyone, never sends.
    if (process.env.VILLA_MANUAL_GUEST_EMAILS !== 'true') {
      await expect(send).toBeDisabled();
      await expect(
        card.locator('[data-test="villa-guest-emails-manual-off"]'),
      ).toBeVisible();
      expect(issues.serverErrors).toEqual([]);
      await page.context().close();

      return;
    }

    await card
      .locator('[data-test="villa-guest-email-pre_arrival-send"]')
      .click();
    await expect(page.getByText('Email sent')).toBeVisible();
    await expect(pre).toContainText('Sent by hand once');
    // A hand-sent email never replaces the automatic one.
    await expect(pre).toContainText('Goes automatically');
    await expect(
      card.locator('[data-test="villa-guest-email-pre_arrival-send"]'),
    ).toHaveText(/Send again/);

    expect(issues.serverErrors).toEqual([]);
    await page.context().close();
  });

  test('the scheduled run sends the arrival email for tomorrow, and not after cancellation', async ({
    browser,
  }) => {
    const secret = process.env.VILLA_E2E_CRON_SECRET;
    test.skip(!VILLA_SITE.key || !secret, 'VILLA_E2E_CRON_SECRET not set');

    // Tomorrow in India, one night.
    const nowIst = new Date(Date.now() + 5.5 * 3_600_000);
    const today = nowIst.toISOString().slice(0, 10);
    const tomorrow = ymdPlus(today, 1);
    const hourIst = nowIst.getUTCHours();

    const page = await signedInPage(browser, VILLA_OWNER.phone);
    await page.goto(`${VILLA_HOME}/bookings`);
    await settle(page);
    await page.click('[data-test="villa-booking-new"]');
    await pickDate(page, 'villa-booking-checkin', tomorrow);
    await pickDate(page, 'villa-booking-checkout', ymdPlus(tomorrow, 1));
    await page.fill('[data-test="villa-booking-adults"]', '2');
    const quote = page.locator('[data-test="villa-booking-quote"]');
    const quoteError = page.locator('[data-test="villa-booking-quote-error"]');
    await expect(quote.or(quoteError)).toBeVisible();
    test.skip(
      await quoteError.isVisible(),
      'tomorrow is not free on the local site',
    );

    await page.fill(
      '[data-test="villa-booking-name"]',
      `E2E Tomorrow ${STAMP}`,
    );
    await page.fill('[data-test="villa-booking-phone"]', '9876500000');
    await page.fill(
      '[data-test="villa-booking-email"]',
      `e2e-tomorrow-${STAMP}@example.test`,
    );
    await page.click('[data-test="villa-booking-submit"]');
    await page.waitForURL(/\/bookings\/[0-9a-f-]{36}/);
    await settle(page);
    const bookingUrl = page.url();

    // Wrong secret: refused.
    const refused = await page.request.get('/api/villa/sync', {
      headers: { authorization: 'Bearer wrong' },
    });
    expect(refused.status()).toBe(401);

    const run = await page.request.get('/api/villa/sync', {
      headers: { authorization: `Bearer ${secret}` },
      timeout: 120_000,
    });
    expect(run.status()).toBe(200);

    await page.goto(bookingUrl);
    await settle(page);
    const pre = page.locator(
      '[data-test="villa-guest-email-pre_arrival-status"]',
    );

    if (hourIst >= 10) {
      await expect(pre).toContainText('Sent');
      await expect(pre).not.toContainText('by hand');
    } else {
      await expect(pre).toContainText('Goes automatically');
    }

    // Cancel it: nothing more goes, and the dates are free again.
    await page.click('[data-test="villa-booking-cancel-open"]');
    await page.click('[data-test="villa-booking-cancel-reason"]');
    await page.click('[data-test="villa-cancel-reason-guest_change_of_plans"]');
    await page.click('[data-test="villa-booking-cancel-confirm"]');
    await expect(page.locator('[data-test="villa-booking-status"]')).toHaveText(
      'Cancelled',
    );

    await page.request.get('/api/villa/sync', {
      headers: { authorization: `Bearer ${secret}` },
      timeout: 120_000,
    });
    await page.reload();
    await settle(page);
    if (hourIst < 10) {
      await expect(pre).toContainText('Not sent: the stay is cancelled');
    }

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

  test('villa owner refunds part of a payment after cancellation', async ({
    browser,
  }) => {
    test.skip(!VILLA_SITE.key || !bookingCode, 'no booking created');

    const page = await signedInPage(browser, VILLA_OWNER.phone);
    const issues = watchPage(page);

    await page.goto(`${VILLA_HOME}/bookings?q=${bookingCode}`);
    await page.waitForURL(/\/bookings\/[0-9a-f-]{36}/);
    await settle(page);

    const panel = page.locator('[data-test="villa-payments"]');
    // A cancelled stay takes refunds, not new payments.
    await expect(
      panel.locator('[data-test="villa-payment-record"]'),
    ).toHaveCount(0);

    await panel.locator('[data-test="villa-payment-refund"]').click();
    await page.fill('[data-test="villa-refund-amount"]', '6000');
    await page.fill(
      '[data-test="villa-refund-reason"]',
      'Cancelled 20 days out',
    );
    await page.click('[data-test="villa-refund-submit"]');
    // Never more than was paid.
    await expect(page.getByText(/more than is left to refund/)).toBeVisible();

    await page.fill('[data-test="villa-refund-amount"]', '2500');
    await page.click('[data-test="villa-refund-submit"]');
    await expect(
      page.getByText(/^Refund [A-Z0-9]+\/RFD\/\d{4}\/\d{4}$/),
    ).toBeVisible();

    await expect(
      panel.locator('[data-test="villa-payment-refund-row"]'),
    ).toContainText('₹2,500');
    await expect(
      panel.locator('[data-test="villa-payments-refunded"]'),
    ).toContainText('₹2,500');

    const refundHref = await panel
      .locator('[data-test="villa-refund-voucher"]')
      .getAttribute('href');
    const refundPage = await page.context().newPage();
    await refundPage.goto(refundHref!);
    await settle(refundPage);
    await expect(
      refundPage.locator('[data-test="villa-voucher-title"]'),
    ).toHaveText('Refund voucher');
    await expect(
      refundPage.locator('[data-test="villa-voucher-words"]'),
    ).toHaveText('Rupees Two Thousand Five Hundred Only');
    await refundPage.close();

    expect(issues.serverErrors).toEqual([]);
    await page.context().close();
  });

  test('villa manager adds an expense; only the owner deletes it', async ({
    browser,
  }) => {
    const manager = await signedInPage(browser, VILLA_MANAGER.phone);
    const issues = watchPage(manager);
    const title = `E2E chlorine ${STAMP}`;

    await manager.goto(VILLA_HOME);
    await settle(manager);
    await sidebar(manager).getByRole('link', { name: 'Expenses' }).click();
    await manager.waitForURL(/\/villa-expenses/);
    await settle(manager);

    await manager.click('[data-test="villa-expense-add"]');
    await manager.fill('[data-test="villa-expense-description"]', title);
    await manager.fill('[data-test="villa-expense-amount"]', '1180');
    await manager.fill('[data-test="villa-expense-gst"]', '2000');
    await manager.click('[data-test="villa-expense-submit"]');
    await expect(
      manager.getByText('GST cannot be more than the amount'),
    ).toBeVisible();
    await manager.fill('[data-test="villa-expense-gst"]', '180');
    await manager.click('[data-test="villa-expense-submit"]');
    await expect(manager.getByText('Expense added')).toBeVisible();

    const row = manager.locator('[data-test="villa-expense-row"]', {
      hasText: title,
    });
    await expect(row).toContainText('₹1,180');
    await expect(
      manager.locator('[data-test="villa-expenses-gst"]'),
    ).toContainText('₹180');
    await expect(row.locator('[data-test="villa-expense-delete"]')).toHaveCount(
      0,
    );

    const overflow = await measureOverflow(manager, 360);
    expect(
      overflow.docOverflow,
      overflow.offenders.join(' | '),
    ).toBeLessThanOrEqual(0);
    if (SHOTS)
      await manager.screenshot({
        path: `${SHOTS}/expenses-360.png`,
        fullPage: true,
      });
    expect(issues.serverErrors).toEqual([]);
    await manager.context().close();

    const owner = await signedInPage(browser, VILLA_OWNER.phone);
    await owner.goto(`${VILLA_HOME}/villa-expenses`);
    await settle(owner);
    const ownerRow = owner.locator('[data-test="villa-expense-row"]', {
      hasText: title,
    });
    await ownerRow.locator('[data-test="villa-expense-delete"]').click();
    await owner.click('[data-test="villa-expense-delete-confirm"]');
    await expect(owner.getByText('Expense deleted')).toBeVisible();
    await expect(ownerRow).toHaveCount(0);
    await owner.context().close();
  });

  test('villa manager blocks nights on the calendar and unblocks them', async ({
    browser,
  }) => {
    test.skip(!VILLA_SITE.key, 'VILLA_DB_TEST_SERVICE_ROLE_KEY not set');

    const page = await signedInPage(browser, VILLA_MANAGER.phone);
    const issues = watchPage(page);
    const day = (ymd: string) =>
      page.locator(`[data-test="villa-calendar-day-${ymd}"]`);

    await page.goto(VILLA_HOME);
    await settle(page);
    await sidebar(page).getByRole('link', { name: 'Calendar' }).click();
    await page.waitForURL(/\/calendar/);
    await settle(page);
    await expectNoErrorBoundary(page);

    // Block three nights.
    await page.click('[data-test="villa-block-new"]');
    await pickDate(page, 'villa-block-first-night', BLOCK_FIRST);
    await pickDate(page, 'villa-block-last-night', BLOCK_LAST);
    await page.fill('[data-test="villa-block-notes"]', 'E2E pool work');
    await page.click('[data-test="villa-block-submit"]');
    await expect(page.getByText('Dates blocked')).toBeVisible();

    // The month grid shows all three nights, and not the morning after.
    await page.goto(`${VILLA_HOME}/calendar?month=${BLOCK_FIRST.slice(0, 7)}`);
    await settle(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const ymd of [BLOCK_FIRST, BLOCK_MIDDLE, BLOCK_LAST]) {
      if (ymd.slice(0, 7) !== BLOCK_FIRST.slice(0, 7)) continue;
      await expect(
        day(ymd).locator('[data-test="villa-calendar-block"]'),
      ).toHaveCount(1);
    }
    if (SHOTS)
      await page.screenshot({
        path: `${SHOTS}/calendar-1280.png`,
        fullPage: true,
      });

    // Unblock only the middle night; the first and last stay blocked.
    await day(BLOCK_FIRST)
      .locator('[data-test="villa-calendar-block"]')
      .click();
    await expect(
      page.locator('[data-test="villa-release-dialog"]'),
    ).toContainText('E2E pool work');
    await expect(
      page.locator('[data-test="villa-release-dialog"]'),
    ).not.toContainText('ooruda:');
    await pickDate(page, 'villa-release-first-night', BLOCK_MIDDLE);
    await pickDate(page, 'villa-release-last-night', BLOCK_MIDDLE);
    await page.click('[data-test="villa-release-submit"]');
    await expect(page.getByText('Nights opened for booking')).toBeVisible();

    await page.goto(`${VILLA_HOME}/calendar?month=${BLOCK_MIDDLE.slice(0, 7)}`);
    await settle(page);
    await expect(
      day(BLOCK_MIDDLE).locator('[data-test="villa-calendar-block"]'),
    ).toHaveCount(0);

    // Phone width: the agenda replaces the grid, with no sideways scroll.
    const overflow = await measureOverflow(page, 360);
    expect(
      overflow.docOverflow,
      overflow.offenders.join(' | '),
    ).toBeLessThanOrEqual(0);
    await expect(
      page.locator('[data-test="villa-calendar-agenda"]'),
    ).toBeVisible();
    if (SHOTS)
      await page.screenshot({
        path: `${SHOTS}/calendar-360.png`,
        fullPage: true,
      });

    // Clean up: release what is left so repeated runs never pile up blocks.
    for (const ymd of [BLOCK_FIRST, BLOCK_LAST]) {
      await page.goto(`${VILLA_HOME}/calendar?month=${ymd.slice(0, 7)}`);
      await settle(page);
      await page.setViewportSize({ width: 1280, height: 900 });
      await day(ymd).locator('[data-test="villa-calendar-block"]').click();
      await page.click('[data-test="villa-release-submit"]');
      await expect(page.getByText('Nights opened for booking')).toBeVisible();
    }

    expect(issues.serverErrors).toEqual([]);
    await page.context().close();
  });

  test('villa owner sees today and this month on the dashboard', async ({
    browser,
  }) => {
    test.skip(!VILLA_SITE.key, 'VILLA_DB_TEST_SERVICE_ROLE_KEY not set');

    const page = await signedInPage(browser, VILLA_OWNER.phone);
    const issues = watchPage(page);

    await page.goto(VILLA_HOME);
    await settle(page);
    await expectNoErrorBoundary(page);

    await expect(page.locator('[data-test="villa-today"]')).toBeVisible();
    await expect(
      page.locator('[data-test="villa-kpi-occupancy"]'),
    ).toContainText('%');
    // The mirror fills in the background after a visit: reload until it has.
    const synced = page.locator('[data-test="villa-kpis-synced"]');
    await expect
      .poll(
        async () => {
          await page.reload();
          await settle(page);
          return synced.innerText();
        },
        { timeout: 30_000, intervals: [1_000, 2_000, 3_000] },
      )
      .toContain('Figures updated');
    await expect(synced).not.toContainText('failed');

    await page.setViewportSize({ width: 1280, height: 900 });
    if (SHOTS)
      await page.screenshot({
        path: `${SHOTS}/dashboard-1280.png`,
        fullPage: true,
      });
    const overflow = await measureOverflow(page, 360);
    expect(
      overflow.docOverflow,
      overflow.offenders.join(' | '),
    ).toBeLessThanOrEqual(0);
    if (SHOTS)
      await page.screenshot({
        path: `${SHOTS}/dashboard-360.png`,
        fullPage: true,
      });

    expect(issues.serverErrors).toEqual([]);
    await page.context().close();
  });

  test('villa owner reads the reports and downloads a CSV', async ({
    browser,
  }) => {
    const page = await signedInPage(browser, VILLA_OWNER.phone);
    const issues = watchPage(page);

    await page.goto(VILLA_HOME);
    await settle(page);
    await sidebar(page).getByRole('link', { name: 'Reports' }).click();
    await page.waitForURL(/\/villa-reports/);
    await settle(page);
    await expectNoErrorBoundary(page);

    await expect(
      page.locator('[data-test="villa-report-occupancy"]'),
    ).toContainText('%');
    await expect(
      page.locator('[data-test="villa-report-months"]'),
    ).toBeVisible();

    // Financial year: twelve months.
    await page.click('[data-test="villa-reports-range"]');
    await page.click('[data-test="villa-reports-range-this_fy"]');
    await page.waitForURL(/range=this_fy/);
    await settle(page);
    await expect(
      page.locator('[data-test="villa-report-months"] tbody tr'),
    ).toHaveCount(12);

    const csv = page.waitForEvent('download');
    await page.click('[data-test="villa-reports-csv"]');
    const file = await csv;
    expect(file.suggestedFilename()).toMatch(/-overview\.csv$/);

    for (const tab of ['channels', 'guests'] as const) {
      await page.click(`[data-test="villa-reports-tab-${tab}"]`);
      await page.waitForURL(new RegExp(`tab=${tab}`));
      await settle(page);
      await expectNoErrorBoundary(page);
    }

    const overflow = await measureOverflow(page, 360);
    expect(
      overflow.docOverflow,
      overflow.offenders.join(' | '),
    ).toBeLessThanOrEqual(0);
    await page.goto(`${VILLA_HOME}/villa-reports?range=this_fy`);
    await settle(page);
    const overflowOverview = await measureOverflow(page, 360);
    expect(
      overflowOverview.docOverflow,
      overflowOverview.offenders.join(' | '),
    ).toBeLessThanOrEqual(0);
    if (SHOTS)
      await page.screenshot({
        path: `${SHOTS}/reports-360.png`,
        fullPage: true,
      });
    await page.setViewportSize({ width: 1280, height: 900 });
    if (SHOTS)
      await page.screenshot({
        path: `${SHOTS}/reports-1280.png`,
        fullPage: true,
      });

    expect(issues.serverErrors).toEqual([]);
    await page.context().close();
  });

  test('discount codes: dark by default; when on, 25% ceiling needs Ooruda approval', async ({
    browser,
  }) => {
    const on = process.env.VILLA_E2E_DISCOUNTS === 'true';
    const owner = await signedInPage(browser, VILLA_OWNER.phone);

    if (!on) {
      // Dark until the booking site enforces codes at checkout.
      // A streamed page answers 200 with the not-found screen: check that.
      await owner.goto(`${VILLA_HOME}/villa-discounts`);
      await settle(owner);
      await expect(owner.getByText(/Page not found|404/).first()).toBeVisible();
      await expect(
        owner.locator('[data-test="villa-discount-new"]'),
      ).toHaveCount(0);
      await owner.goto(VILLA_HOME);
      await settle(owner);
      await expect(
        sidebar(owner).getByRole('link', { name: 'Discount codes' }),
      ).toHaveCount(0);
      await owner.context().close();
      return;
    }

    const issues = watchPage(owner);
    await owner.goto(VILLA_HOME);
    await settle(owner);
    await sidebar(owner).getByRole('link', { name: 'Discount codes' }).click();
    await owner.waitForURL(/\/villa-discounts/);
    await settle(owner);

    const make = async (code: string, pct: string, cap: string) => {
      await owner.click('[data-test="villa-discount-new"]');
      await owner.fill('[data-test="villa-discount-code"]', code);
      await owner.fill('[data-test="villa-discount-discountValue"]', pct);
      await owner.fill('[data-test="villa-discount-maxDiscount"]', cap);
      await pickDate(owner, 'villa-discount-to', '2031-12-31');
      await owner.click('[data-test="villa-discount-submit"]');
    };

    await make(`TEN${STAMP.slice(-4)}`.toUpperCase(), '10', '3000');
    await expect(owner.getByText('Code saved')).toBeVisible();

    await make(`BIG${STAMP.slice(-4)}`.toUpperCase(), '40', '10000');
    await expect(owner.getByText(/Ooruda will check it/)).toBeVisible();

    const big = owner.locator('[data-test="villa-discount-row"]', {
      hasText: `BIG${STAMP.slice(-4)}`.toUpperCase(),
    });
    await expect(big.locator('[data-test="villa-discount-status"]')).toHaveText(
      'Awaiting Ooruda approval',
    );
    // The owner cannot switch it on or approve it.
    await expect(
      big.locator('[data-test="villa-discount-toggle"]'),
    ).toHaveCount(0);
    await expect(
      big.locator('[data-test="villa-discount-approve"]'),
    ).toHaveCount(0);
    expect(issues.serverErrors).toEqual([]);
    await owner.context().close();

    const context = await browser.newContext({
      storageState: authFile('superAdmin'),
    });
    const admin = await context.newPage();
    await admin.goto(`${VILLA_HOME}/villa-discounts`);
    await settle(admin);
    const row = admin.locator('[data-test="villa-discount-row"]', {
      hasText: `BIG${STAMP.slice(-4)}`.toUpperCase(),
    });
    await row.locator('[data-test="villa-discount-approve"]').click();
    await expect(row.locator('[data-test="villa-discount-status"]')).toHaveText(
      'Active',
    );
    await expect(
      row.locator('[data-test="villa-discount-history"]'),
    ).toContainText('Approved by Ooruda');
    await context.close();
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
      page.locator('[data-test="role-option-villa_admin"]'),
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
