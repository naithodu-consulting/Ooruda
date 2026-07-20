import { Page, expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { TeamAccountsPageObject } from '../team-accounts/team-accounts.po';
import { AUTH_STATES } from '../utils/auth-state';

test.describe('Admin Auth flow without MFA', () => {
  AuthPageObject.setupSession(AUTH_STATES.OWNER_USER);

  test('will return a 404 for non-admin users', async ({ page }) => {
    await page.goto('/admin');

    expect(page.url()).toContain('/404');
  });
});

test.describe('Admin Auth flow with Super Admin but without MFA', () => {
  AuthPageObject.setupSession(AUTH_STATES.TEST_USER);

  test('will redirect to 404 for admin users without MFA', async ({ page }) => {
    await page.goto('/admin');

    expect(page.url()).toContain('/404');
  });
});

test.describe('Admin', () => {
  test.describe.configure({ mode: 'serial' });

  test.describe('Admin Dashboard', () => {
    AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

    test('displays all stat cards', async ({ page }) => {
      await page.goto('/admin');

      // Check all stat cards are present
      await expect(page.getByText('Users', { exact: true })).toBeVisible();

      await expect(
        page.getByText('Team Accounts', { exact: true }),
      ).toBeVisible();

      await expect(
        page.getByText('Paying Customers', { exact: true }),
      ).toBeVisible();

      await expect(page.getByText('Trials', { exact: true })).toBeVisible();

      // Verify stat values are numbers
      const stats = await page.$$('.text-3xl.font-bold');

      for (const stat of stats) {
        const value = await stat.textContent();
        expect(Number.isInteger(Number(value))).toBeTruthy();
      }
    });
  });

  test.describe('Personal Account Management', () => {
    AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

    let testUserEmail: string;

    test.beforeEach(async ({ page }) => {
      // Create a new test user before each test
      testUserEmail = await createUser(page);

      await page.goto(`/admin/accounts`);

      // use the email as the filter text
      const filterText = testUserEmail;

      await expect(async () => {
        await filterAccounts(page, filterText);
        await selectAccount(page, filterText);
      }).toPass();
    });

    test('ban user flow', async ({ page }) => {
      await page.getByTestId('admin-ban-account-button').click();

      await expect(
        page.getByRole('heading', { name: 'Ban User' }),
      ).toBeVisible();

      // Try with invalid confirmation
      await page.fill('[placeholder="Type CONFIRM to confirm"]', 'WRONG');
      await page.getByRole('button', { name: 'Ban User' }).click();

      await expect(
        page.getByRole('heading', { name: 'Ban User' }),
      ).toBeVisible(); // Dialog should still be open

      // Confirm with correct text
      await page.fill('[placeholder="Type CONFIRM to confirm"]', 'CONFIRM');

      await Promise.all([
        page.getByRole('button', { name: 'Ban User' }).click(),
        page.waitForResponse(
          (response) =>
            response.url().includes('/admin/accounts') &&
            response.request().method() === 'POST',
        ),
      ]);

      // TODO: find out why we need to reload the page only in CI
      await page.reload();

      await expect(page.getByText('Banned').first()).toBeVisible();

      await page.context().clearCookies();

      // Verify user can't log in
      await page.goto('/auth/sign-in');

      const auth = new AuthPageObject(page);

      await auth.signIn({
        email: testUserEmail,
        password: 'testingpassword',
      });

      // Should show an error message
      await expect(
        page.locator('[data-test="auth-error-message"]'),
      ).toBeVisible();
    });

    test('reactivate user flow', async ({ page }) => {
      // First ban the user
      await page.getByTestId('admin-ban-account-button').click();
      await page.fill('[placeholder="Type CONFIRM to confirm"]', 'CONFIRM');
      await page.getByRole('button', { name: 'Ban User' }).click();

      await expect(page.getByText('Banned').first()).toBeVisible();

      // Now reactivate
      await page.getByTestId('admin-reactivate-account-button').click();

      await expect(
        page.getByRole('heading', { name: 'Reactivate User' }),
      ).toBeVisible();

      await page.fill('[placeholder="Type CONFIRM to confirm"]', 'CONFIRM');

      await Promise.all([
        page.getByRole('button', { name: 'Reactivate User' }).click(),
        page.waitForResponse(
          (response) =>
            response.url().includes('/admin/accounts') &&
            response.request().method() === 'POST',
        ),
      ]);

      // Verify ban badge is removed
      await expect(page.getByText('Banned')).not.toBeVisible();

      // Log out
      await page.context().clearCookies();
      await page.reload();

      // Verify user can log in again
      await page.goto('/auth/sign-in');

      const auth = new AuthPageObject(page);

      await auth.loginAsUser({
        email: testUserEmail,
      });
    });

    test('delete user flow', async ({ page }) => {
      const auth = new AuthPageObject(page);

      await page.getByTestId('admin-delete-account-button').click();

      await expect(
        page.getByRole('heading', { name: 'Delete User' }),
      ).toBeVisible();

      // Try with invalid confirmation
      await page.fill('[placeholder="Type CONFIRM to confirm"]', 'WRONG');

      await page.getByRole('button', { name: 'Delete' }).click();

      await expect(
        page.getByRole('heading', { name: 'Delete User' }),
      ).toBeVisible(); // Dialog should still be open

      // Confirm with correct text
      await page.fill('[placeholder="Type CONFIRM to confirm"]', 'CONFIRM');

      await page.getByRole('button', { name: 'Delete' }).click();

      // Should redirect to admin dashboard
      await page.waitForURL('/admin/accounts');

      // Log out
      await auth.signOut();
      await page.waitForURL('/');

      await auth.goToSignIn();

      await auth.signIn({
        email: testUserEmail,
        password: 'testingpassword',
      });

      // Should show an error message
      await expect(
        page.locator('[data-test="auth-error-message"]'),
      ).toBeVisible();
    });
  });

  test.describe('Impersonation', () => {
    // TODO: fix this test - unclear why it fails in the CI
    test.skip('can sign in as a user', async ({ page }) => {
      const auth = new AuthPageObject(page);

      await auth.loginAsSuperAdmin({});
      const filterText = await createUser(page);

      await page.goto(`/admin/accounts`);

      await expect(async () => {
        await filterAccounts(page, filterText);
        await selectAccount(page, filterText);
      }).toPass();

      await page.getByTestId('admin-impersonate-button').click();

      await expect(
        page.getByRole('heading', { name: 'Impersonate User' }),
      ).toBeVisible();

      await page.fill('[placeholder="Type CONFIRM to confirm"]', 'CONFIRM');
      await page.getByRole('button', { name: 'Impersonate User' }).click();

      // Should redirect to home and be logged in as the user
      await page.waitForURL('/home');
    });
  });
});

test.describe('Team Account Management', () => {
  test.describe.configure({ mode: 'serial' });

  test.skip(
    process.env.ENABLE_TEAM_ACCOUNT_TESTS !== 'true',
    'Team account tests are disabled',
  );

  let testUserEmail: string;
  let teamName: string;
  let slug: string;

  test.beforeEach(async ({ page }) => {
    const auth = new AuthPageObject(page);

    // Create a new test user and team account
    testUserEmail = await createUser(page);

    teamName = `test-${Math.random().toString(36).substring(2, 15)}`;

    await auth.loginAsUser({ email: testUserEmail });

    const teamAccountPo = new TeamAccountsPageObject(page);
    const teamSlug = teamName.toLowerCase().replace(/ /g, '-');

    slug = teamSlug;

    await teamAccountPo.createTeam({
      teamName,
      slug,
    });

    await page.waitForTimeout(250);

    await auth.signOut();
    await page.waitForURL('/');

    await auth.loginAsSuperAdmin({});

    await page.goto(`/admin/accounts`);

    await expect(async () => {
      await filterAccounts(page, teamName);
      await selectAccount(page, teamName);
    }).toPass();
  });

  test('delete association flow', async ({ page }) => {
    await expect(page.getByText('Association')).toBeVisible();

    await page.getByTestId('admin-delete-account-button').click();

    await expect(
      page.getByRole('heading', { name: 'Delete Account' }),
    ).toBeVisible();

    // Try with invalid confirmation
    await page.fill('[placeholder="Type CONFIRM to confirm"]', 'WRONG');
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(
      page.getByRole('heading', { name: 'Delete Account' }),
    ).toBeVisible(); // Dialog should still be open

    // Confirm with correct text
    await page.fill('[placeholder="Type CONFIRM to confirm"]', 'CONFIRM');
    await page.getByRole('button', { name: 'Delete' }).click();

    // Should redirect to admin dashboard after deletion
    await expect(page).toHaveURL('/admin/accounts');
  });
});

async function createUser(page: Page) {
  const auth = new AuthPageObject(page);

  const password = 'testingpassword';
  const email = auth.createRandomEmail();

  // create user using bootstrap method
  await auth.bootstrapUser({
    email,
    password,
    name: 'Test User',
  });

  // return the email
  return email;
}

async function filterAccounts(page: Page, email: string) {
  await page
    .locator('[data-test="admin-accounts-table-filter-input"]')
    .first()
    .fill(email);

  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
}

async function selectAccount(page: Page, email: string) {
  const link = page
    .locator('tr', { hasText: email.split('@')[0] })
    .locator('a');

  await expect(link).toBeVisible();

  await link.click();

  await page.waitForURL(/\/admin\/accounts\/[^/]+/);
}
