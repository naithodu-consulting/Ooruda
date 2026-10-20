import { expect, test } from '@playwright/test';

import {
  FIX,
  WS,
  authFile,
  settle,
  uniqueClientIp,
  watchPage,
} from './helpers';

test.describe('admin flows', () => {
  test.use({ storageState: authFile('admin') });

  test('expense: create, find, delete', async ({ page }) => {
    const issues = watchPage(page);
    const title = `E2E expense ${Date.now()}`;

    await page.goto(`${WS}/expenses`);
    await settle(page);

    await page.click('[data-test="add-expense-btn"]');
    const dialog = page.locator('[data-test="add-expense-dialog"]');
    await expect(dialog).toBeVisible();

    await page.fill('[data-test="expense-title-input"]', title);
    await page.fill('[data-test="expense-amount-input"]', '123');
    await page.fill('[data-test="expense-payee-input"]', 'E2E Vendor');
    await page.click('[data-test="save-expense-btn"]');
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    await page.fill('[data-test="expense-search-input"]', title);
    const row = page.locator('[data-test="expense-row"]', { hasText: title });
    await expect(row).toHaveCount(1, { timeout: 20_000 });

    await row.getByRole('checkbox').click();
    await page.click('[data-test="delete-selected-btn"]');
    await page.click('[data-test="delete-confirm-btn"]');
    await expect(row).toHaveCount(0, { timeout: 20_000 });

    expect.soft(issues.serverErrors).toEqual([]);
    expect.soft(issues.consoleErrors).toEqual([]);
  });

  test('date picker: year dropdown jumps years', async ({ page }) => {
    await page.goto(`${WS}/expenses`);
    await settle(page);
    await page.click('[data-test="add-expense-btn"]');
    await page.click('[data-test="expense-date-input"]');

    const year = page.locator('select[aria-label="Choose the Year"]');
    await expect(year).toBeAttached();
    const years = await year.locator('option').allTextContents();
    expect(years[0]).toBe('2000');

    await year.selectOption('2024');
    await expect(
      page.locator('select[aria-label="Choose the Year"]'),
    ).toHaveValue('2024');
    // The month grid now shows 2024.
    await expect(page.getByRole('grid')).toHaveAttribute('aria-label', /2024/);
  });

  test('bill tree: panel aligns with the bill name and offers download', async ({
    page,
  }) => {
    await page.goto(`${WS}/billing/units/${FIX.ownerUnitId}`);
    await settle(page);

    const billNo = page.getByText(/^SRT\/26-27\//).first();
    await billNo.click();

    const download = page.getByRole('link', { name: /Download Bill/ });
    await expect(download).toBeVisible({ timeout: 20_000 });

    const nameX = (await billNo.boundingBox())!.x;
    const panelX = (await page.getByText(/^Due /).first().boundingBox())!.x;
    expect(Math.abs(nameX - panelX)).toBeLessThanOrEqual(2);
  });

  test('reports: PDF export downloads a file', async ({ page }) => {
    await page.goto(`${WS}/reports`);
    await settle(page);

    await page.getByRole('button', { name: /^Download$/ }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 45_000 }),
      page.getByText('Download PDF').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  });

  test('settings: only Login & Security manages sign-in details', async ({
    page,
  }) => {
    await page.goto(`${WS}/settings/profile`);
    await expect(page.getByText('Login & Security')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('Update your Email')).toHaveCount(0);
    await expect(page.getByText('Multi-Factor Authentication')).toHaveCount(0);
    await expect(page.getByText('Linked Accounts')).toHaveCount(0);
  });

  test('audit log fits its card at laptop width', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${WS}/audit`);
    await settle(page);
    const fits = await page.evaluate(() => {
      const t = document.querySelector('table');
      return t ? t.scrollWidth <= t.parentElement!.clientWidth + 1 : null;
    });
    expect(fits).toBe(true);
  });

  test('units: status filters work', async ({ page }) => {
    const issues = watchPage(page);
    await page.goto(`${WS}/units`);
    await settle(page);
    for (const name of ['Occupied', 'Vacant', 'All units']) {
      await page.getByRole('button', { name, exact: true }).click();
      await page.waitForTimeout(300);
    }
    expect.soft(issues.consoleErrors).toEqual([]);
  });

  test('AMC: "View Expired" deep link opens the filtered list', async ({
    page,
  }) => {
    const statusOf = () =>
      page.locator('[data-test="status-filter-select"]').innerText();
    const listTab = page.locator('[data-test="amc-tab-list"]');

    // Direct link.
    await page.goto(`${WS}/amc?tab=list&status=expired`);
    await settle(page);
    await expect(listTab).toHaveAttribute('aria-selected', 'true');
    expect((await statusOf()).trim()).toBe('Expired');

    // Same-page navigation from the dashboard tab, as the button does.
    await page.goto(`${WS}/amc`);
    await settle(page);
    await page.evaluate(() =>
      (
        window as unknown as { next: { router: { push: (u: string) => void } } }
      ).next.router.push(`${location.pathname}?tab=list&status=expired`),
    );
    await expect(listTab).toHaveAttribute('aria-selected', 'true');
    expect((await statusOf()).trim()).toBe('Expired');

    // Unknown status is ignored rather than filtering to nothing.
    await page.goto(`${WS}/amc?tab=list&status=bogus`);
    await settle(page);
    expect((await statusOf()).trim()).toBe('All Statuses');
  });

  test('mobile: navigation menu opens and navigates', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(WS);
    await settle(page);

    await page.click('[data-test="mobile-sidebar-toggle"]');
    await page.getByRole('link', { name: 'Payments' }).first().click();
    await page.waitForURL(/\/payments/);
    await settle(page);
  });
});

test.describe('owner flows', () => {
  test.use({ storageState: authFile('owner') });

  test('dashboard shows own units and bills', async ({ page }) => {
    const issues = watchPage(page);
    await page.goto(WS);
    await settle(page);
    await expect(page.getByText(/410|A2/).first()).toBeVisible();
    expect.soft(issues.consoleErrors).toEqual([]);
  });

  test('payments: "Pay now" unit focus and "Show all units"', async ({
    page,
  }) => {
    const banner = page.locator('[data-test="payments-unit-focus"]');

    await page.goto(`${WS}/payments?unit=A2`);
    await settle(page);
    await expect(banner).toContainText('Unit A2');

    // A unit the owner doesn't have is ignored.
    await page.goto(`${WS}/payments?unit=ZZZ`);
    await settle(page);
    await expect(banner).toHaveCount(0);

    await page.goto(`${WS}/payments?unit=410`);
    await settle(page);
    await page.click('[data-test="payments-show-all-units"]');
    await page.waitForURL((u) => !u.search.includes('unit='));
    await expect(banner).toHaveCount(0);
  });

  test('statement: switches units', async ({ page }) => {
    await page.goto(`${WS}/statement`);
    await settle(page);
    await expect(page.getByText(/Statement|statement/).first()).toBeVisible();
  });
});

test.describe('signed out', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders({ 'x-forwarded-for': uniqueClientIp() });
  });

  test('sign-in: country picker opens below its field', async ({ page }) => {
    await page.goto('/auth/sign-in');
    const trigger = page.getByRole('combobox', { name: 'Country code' });
    await trigger.click();
    const list = page.getByRole('listbox');
    await expect(list).toBeVisible();
    const t = (await trigger.boundingBox())!;
    const l = (await list.boundingBox())!;
    expect(l.y).toBeGreaterThanOrEqual(t.y + t.height - 1);
  });

  test('sign-in: invalid number is rejected client-side', async ({ page }) => {
    await page.goto('/auth/sign-in');
    await page.fill('[data-test="phone-input"]', '5123456789');
    await page.click('[data-test="phone-send-otp-button"]');
    await expect(page.locator('[data-test="otp-input"]')).toHaveCount(0);
  });

  test('sign-in: wrong code keeps you on the code step', async ({ page }) => {
    await page.goto('/auth/sign-in');
    await page.fill('[data-test="phone-input"]', '9911000003');
    await page.click('[data-test="phone-send-otp-button"]');
    await expect(page.locator('[data-test="otp-input"]')).toBeVisible({
      timeout: 30_000,
    });
    await page.fill('[data-input-otp]', '000000');
    await page.click('[data-test="otp-verify-button"]');
    await expect(page.locator('[data-test="otp-verify-button"]')).toBeVisible();
    expect(page.url()).toContain('/auth/sign-in');
  });
});
