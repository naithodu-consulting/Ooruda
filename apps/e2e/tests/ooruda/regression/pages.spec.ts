import { expect, test } from '@playwright/test';

import {
  FIX,
  type RoleKey,
  WS,
  authFile,
  expectNoErrorBoundary,
  measureOverflow,
  settle,
  watchPage,
  uniqueClientIp,
} from './helpers';

/**
 * Page matrix: every workspace page, per role. `true` = the role may open it
 * (it must render cleanly and responsively); `false` = the role must be
 * redirected away (never shown the page).
 */
const PAGES: {
  path: string;
  admin: boolean;
  operator: boolean;
  owner: boolean;
  tenant: boolean;
}[] = [
  { path: '', admin: true, operator: true, owner: true, tenant: true },
  { path: '/units', admin: true, operator: true, owner: false, tenant: false },
  {
    path: `/units/${FIX.ownerUnitId}`,
    admin: true,
    operator: true,
    owner: false,
    tenant: false,
  },
  {
    path: '/billing',
    admin: true,
    operator: true,
    owner: false,
    tenant: false,
  },
  {
    path: '/billing/drafts',
    admin: true,
    operator: true,
    owner: false,
    tenant: false,
  },
  {
    path: '/billing/units',
    admin: true,
    operator: true,
    owner: false,
    tenant: false,
  },
  {
    path: `/billing/units/${FIX.ownerUnitId}`,
    admin: true,
    operator: true,
    owner: false,
    tenant: false,
  },
  {
    path: '/electricity',
    admin: true,
    operator: true,
    owner: false,
    tenant: false,
  },
  { path: '/payments', admin: true, operator: true, owner: true, tenant: true },
  {
    path: '/cash-ledger',
    admin: true,
    operator: true,
    owner: false,
    tenant: false,
  },
  {
    path: '/expenses',
    admin: true,
    operator: true,
    owner: false,
    tenant: false,
  },
  {
    path: `/expenses/${FIX.expenseId}`,
    admin: true,
    operator: true,
    owner: false,
    tenant: false,
  },
  { path: '/amc', admin: true, operator: false, owner: false, tenant: false },
  {
    path: `/amc/${FIX.amcId}`,
    admin: true,
    operator: false,
    owner: false,
    tenant: false,
  },
  {
    path: '/reports',
    admin: true,
    operator: true,
    owner: false,
    tenant: false,
  },
  {
    path: '/statement',
    admin: false,
    operator: false,
    owner: true,
    tenant: true,
  },
  {
    path: '/notifications',
    admin: true,
    operator: true,
    owner: true,
    tenant: true,
  },
  { path: '/audit', admin: true, operator: false, owner: false, tenant: false },
  { path: '/members', admin: true, operator: true, owner: true, tenant: true },
  {
    path: '/settings/association',
    admin: true,
    operator: false,
    owner: false,
    tenant: false,
  },
  {
    path: '/settings/profile',
    admin: true,
    operator: true,
    owner: true,
    tenant: true,
  },
];

const WIDTHS = [360, 768, 1280];

for (const role of ['admin', 'operator', 'owner', 'tenant'] as RoleKey[]) {
  test.describe(`${role}: pages`, () => {
    test.use({ storageState: authFile(role) });

    for (const pg of PAGES) {
      const allowed = pg[role as 'admin' | 'operator' | 'owner' | 'tenant'];
      const url = `${WS}${pg.path}`;
      const name = pg.path || '/ (dashboard)';

      if (allowed) {
        test(`renders ${name} cleanly and responsively`, async ({ page }) => {
          const issues = watchPage(page);
          const res = await page.goto(url);

          expect(res?.status(), 'HTTP status').toBeLessThan(400);
          await settle(page);
          await expectNoErrorBoundary(page);

          // Must stay on this page (no unexpected redirect).
          expect(new URL(page.url()).pathname).toContain(
            pg.path.split('/')[1] ?? '',
          );

          for (const width of WIDTHS) {
            const o = await measureOverflow(page, width);
            expect
              .soft(
                o.docOverflow,
                `horizontal overflow at ${width}px: ${o.offenders.join(' | ')}`,
              )
              .toBeLessThanOrEqual(0);
          }

          expect.soft(issues.serverErrors, '5xx responses').toEqual([]);
          expect.soft(issues.consoleErrors, 'console errors').toEqual([]);
        });
      } else {
        test(`is blocked from ${name}`, async ({ page }) => {
          await page.goto(url);
          // Server redirects under a streaming loading.tsx complete on the
          // client, after the HTML arrives - wait for the URL to change.
          await page.waitForURL((u) => u.pathname !== url, { timeout: 20_000 });
          // Never shown the page's content.
          await expect(page.locator('h1').first()).toBeVisible();
        });
      }
    }
  });
}

test.describe('super admin', () => {
  test.use({ storageState: authFile('superAdmin') });

  for (const path of [
    '/admin',
    '/admin/accounts',
    '/admin/activity',
    '/admin/bill-dispatch',
    '/admin/channels',
  ]) {
    test(`renders ${path}`, async ({ page }) => {
      const issues = watchPage(page);
      const res = await page.goto(path);
      expect(res?.status()).toBeLessThan(400);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await expectNoErrorBoundary(page);
      // /admin itself forwards to /admin/accounts.
      expect(new URL(page.url()).pathname).toContain(
        path === '/admin' ? '/admin/accounts' : path,
      );

      for (const width of WIDTHS) {
        const o = await measureOverflow(page, width);
        expect
          .soft(
            o.docOverflow,
            `overflow at ${width}px: ${o.offenders.join(' | ')}`,
          )
          .toBeLessThanOrEqual(0);
      }
      expect.soft(issues.serverErrors).toEqual([]);
      expect.soft(issues.consoleErrors).toEqual([]);
    });
  }

  test('can open an association workspace', async ({ page }) => {
    const res = await page.goto(`${WS}`);
    expect(res?.status()).toBeLessThan(400);
    await settle(page);
    await expectNoErrorBoundary(page);
  });
});

test.describe('public pages', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders({ 'x-forwarded-for': uniqueClientIp() });
  });

  for (const path of [
    '/auth/sign-in',
    '/privacy-policy',
    '/terms-of-service',
    '/refund-policy',
  ]) {
    test(`renders ${path}`, async ({ page }) => {
      const issues = watchPage(page);
      const res = await page.goto(path);
      expect(res?.status()).toBeLessThan(400);
      await expectNoErrorBoundary(page);
      for (const width of WIDTHS) {
        const o = await measureOverflow(page, width);
        expect
          .soft(o.docOverflow, `overflow at ${width}px`)
          .toBeLessThanOrEqual(0);
      }
      expect.soft(issues.consoleErrors).toEqual([]);
    });
  }

  test('robots.txt and sitemap.xml are served', async ({ request }) => {
    expect((await request.get('/robots.txt')).status()).toBe(200);
    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain('<urlset');
  });

  test('signed-out users are sent to sign in', async ({ page }) => {
    await page.goto(`${WS}/payments`);
    await page.waitForURL(/\/auth\/sign-in/);
  });
});
