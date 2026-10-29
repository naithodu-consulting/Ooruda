import { type BrowserContext, type Page, expect } from '@playwright/test';

import { join } from 'node:path';

export const SLUG = 'sandbox-residency-test';
export const WS = `/home/${SLUG}`;
export const TEST_OTP = '123456';

/** Local test accounts (supabase/config.toml test OTPs) and their roles. */
export const ROLES = {
  admin: { phone: '9911000006', label: 'assoc_admin' },
  operator: { phone: '9911000008', label: 'billing_operator' },
  owner: { phone: '9911000020', label: 'prop_owner' },
  tenant: { phone: '9911000005', label: 'tenant' },
  superAdmin: { phone: '9742914274', label: 'super-admin' },
} as const;

export type RoleKey = keyof typeof ROLES;

export const authFile = (role: RoleKey) =>
  join(process.cwd(), `.auth/ooruda-${role}.json`);

/** Known fixture ids in the sandbox association. */
export const FIX = {
  ownerUnitId: '4ee3c73d-81ab-4e8b-8163-4ec1a75452f1', // unit 410, owned by owner
  ownerUnitId2: '23d98de9-d0d2-4b47-ab57-ff693f5ae87f', // unit A2, owned by owner
  ownerBillId: '2483864d-fe5f-41db-a982-eb159d0a5f48', // bill on owner's unit
  otherBillId: '8cc9bf60-0f00-45af-be7a-46ed430341fc', // bill on someone else's unit
  receiptPaymentId: '6229a8ec-08e7-49cf-80e2-c8c8085a38dd',
  expenseId: '6e7b97f3-c248-4690-86d3-a3aacb398b4b',
  amcId: '638f05f5-5722-43bc-9bee-1315f025f83f',
  associationId: 'fc1de46d-d024-46a2-b4ff-f3bda2bd764f',
};

/**
 * The early-access gate sits in front of every page outside production. The
 * gate only checks a cookie, so a test sets it rather than driving the form.
 */
export async function passAccessGate(
  context: BrowserContext,
  baseURL?: string,
) {
  await context.addCookies([
    {
      name: 'ooruda_access',
      value: '1',
      url: baseURL ?? process.env.OORUDA_BASE_URL ?? 'http://localhost:3000',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

export async function signIn(page: Page, phone: string) {
  // Each attempt starts from a fresh page: a click that lands before React has
  // hydrated the form is silently dropped. Gaps between attempts stay above
  // Auth's 60s per-number resend limit.
  await expect(async () => {
    await page.goto('/auth/sign-in');
    await page.waitForLoadState('networkidle');
    await page.fill('[data-test="phone-input"]', phone);
    await page.click('[data-test="phone-send-otp-button"]');
    await expect(page.locator('[data-test="otp-input"]')).toBeVisible({
      timeout: 20_000,
    });
  }).toPass({ intervals: [2_000, 65_000], timeout: 200_000 });

  await page.fill('[data-input-otp]', TEST_OTP);
  await page.click('[data-test="otp-verify-button"]');
  await page.waitForURL(/\/(home|admin)/, { timeout: 45_000 });
}

/** Console/network noise that isn't an app defect. */
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /favicon/i,
  /\[Fast Refresh\]/i,
  /Failed to load resource: the server responded with a status of 404.*_rsc/i,
];

export type PageIssues = {
  consoleErrors: string[];
  serverErrors: string[];
};

/** Collects console errors, uncaught exceptions and 5xx responses. */
export function watchPage(page: Page): PageIssues {
  const issues: PageIssues = { consoleErrors: [], serverErrors: [] };

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    issues.consoleErrors.push(text.slice(0, 300));
  });
  page.on('pageerror', (err) =>
    issues.consoleErrors.push(`pageerror: ${err.message.slice(0, 300)}`),
  );
  page.on('response', (res) => {
    if (res.status() >= 500) {
      issues.serverErrors.push(`${res.status()} ${res.url()}`);
    }
  });

  return issues;
}

/** Waits for the page to settle: heading present, no skeletons left. */
export async function settle(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  // Let hydration finish before any viewport change: resizing mid-hydration
  // makes width-dependent components mismatch (React #418).
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
  await page
    .waitForFunction(() => !document.querySelector('.animate-pulse'), null, {
      timeout: 15_000,
    })
    .catch(() => undefined);
}

/** Text that only appears when a route crashed. */
export async function expectNoErrorBoundary(page: Page) {
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(
    /Application error|Something went wrong|Internal Server Error|Unhandled Runtime Error/i,
  );
}

/**
 * Horizontal overflow at a given width: how far the document is wider than
 * the viewport, plus elements poking past the right edge that aren't inside a
 * deliberate horizontal-scroll container.
 */
export async function measureOverflow(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(400);

  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders: string[] = [];

    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.right <= vw + 1) continue;

      let a = el.parentElement;
      let inScroller = false;
      while (a && a !== document.body) {
        const x = getComputedStyle(a).overflowX;
        if (x === 'auto' || x === 'scroll' || x === 'hidden' || x === 'clip') {
          inScroller = true;
          break;
        }
        a = a.parentElement;
      }

      if (!inScroller) {
        const cls = String(
          (el as HTMLElement).className?.toString?.() ?? '',
        ).slice(0, 60);
        offenders.push(
          `${el.tagName.toLowerCase()}.${cls} r=${Math.round(r.right)}`,
        );
      }
    }

    return {
      docOverflow: document.documentElement.scrollWidth - vw,
      offenders: offenders.slice(0, 5),
    };
  });
}

let ipCounter = 0;

/**
 * Gives each test its own client address for proxy.ts's per-IP sign-in
 * rate limit, so signed-out tests don't trip it for each other.
 */
export function uniqueClientIp() {
  ipCounter += 1;
  return `10.2.${process.pid % 250}.${ipCounter % 250}`;
}
