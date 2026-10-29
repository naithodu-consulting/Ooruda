import { expect, test } from '@playwright/test';

import {
  expectNoErrorBoundary,
  measureOverflow,
  passAccessGate,
  signIn,
} from './helpers';

const VILLA = '/home/villa-19-test';
const ADMIN_PHONE = '9900000001';

// `ready` must be a selector inside the page's real CONTENT, never in the
// shell: Reports and Discount codes now stream their body behind Suspense, so
// waiting on an <h1> would time the shell paint and report a speed-up that is
// really just the split.
const PAGES: { name: string; path: string; ready: string }[] = [
  { name: 'Dashboard', path: VILLA, ready: '[data-test="villa-kpis"]' },
  {
    name: 'Bookings',
    path: `${VILLA}/bookings`,
    ready:
      '[data-test="villa-booking-row"], [data-test="villa-bookings-empty"]',
  },
  {
    name: 'Blocked dates',
    path: `${VILLA}/bookings?view=blocked`,
    ready:
      '[data-test="villa-blocked-list"], [data-test="villa-blocked-empty"]',
  },
  {
    name: 'Calendar',
    path: `${VILLA}/calendar`,
    ready: '[data-test="villa-calendar-grid"]',
  },
  ...(
    [
      ['overview', ''],
      ['expenses', '?tab=expenses'],
      ['payments', '?tab=payments'],
      ['GST', '?tab=gst_summary'],
      ['channels', '?tab=channels'],
      ['guests', '?tab=guests'],
    ] as const
  ).map(([label, query]) => ({
    name: `Reports · ${label}`,
    path: `${VILLA}/villa-reports${query}`,
    // Rendered by ReportsView, i.e. inside the streamed boundary.
    ready: '[data-test="villa-reports-period"]',
  })),
  {
    name: 'Expenses',
    path: `${VILLA}/villa-expenses`,
    ready: '[data-test="villa-expenses-total"]',
  },
  {
    name: 'Discounts',
    path: `${VILLA}/villa-discounts`,
    // Rendered by DiscountsView, i.e. inside the streamed boundary.
    ready:
      '[data-test="villa-discounts-info"], [data-test="villa-discounts-empty"]',
  },
  {
    name: 'Activity',
    path: `${VILLA}/villa-activity`,
    // The search box is rendered by the table itself, so it proves the table
    // mounted whether or not this villa has any activity yet.
    ready: '[data-test="villa-activity-search"]',
  },
  {
    name: 'Settings',
    path: `${VILLA}/villa-settings`,
    // The tab bar is always rendered once settings load; the property picker
    // only appears for a multi-property villa.
    ready:
      '[data-test="villa-settings-tab-rates"], [data-test="villa-settings-no-property"]',
  },
];

// Opt-in: it walks one specific local villa account (villa-19-test), so it is
// a developer's smoke test for the villa screens rather than a CI gate.
// Run with: VILLA_PAGE_WALK=1 pnpm --filter web-e2e exec playwright test villa-perf
test.skip(!process.env.VILLA_PAGE_WALK, 'set VILLA_PAGE_WALK=1 to run');

test('villa pages all render, timed', async ({ page, context }) => {
  test.setTimeout(420_000);

  await passAccessGate(context);
  await signIn(page, ADMIN_PHONE);

  const timings: string[] = [];

  for (const p of PAGES) {
    const started = Date.now();
    await page.goto(p.path, { waitUntil: 'domcontentloaded' });
    const ttfb = Date.now() - started;

    await expect(page.locator(p.ready).first()).toBeAttached({
      timeout: 60_000,
    });
    const visible = Date.now() - started;

    await page.waitForLoadState('networkidle').catch(() => undefined);
    await expectNoErrorBoundary(page);

    timings.push(
      `${p.name.padEnd(22)} shell ${String(ttfb).padStart(5)}ms   content ${String(visible).padStart(5)}ms`,
    );
  }

  console.log('\n=== villa page timings ===\n' + timings.join('\n') + '\n');
});

test('villa pages have no horizontal overflow at 360px', async ({
  page,
  context,
}) => {
  test.setTimeout(420_000);

  await passAccessGate(context);
  await signIn(page, ADMIN_PHONE);
  await page.setViewportSize({ width: 360, height: 780 });

  const bad: string[] = [];

  for (const p of PAGES) {
    await page.goto(p.path, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(p.ready).first()).toBeAttached({
      timeout: 60_000,
    });
    await page.waitForLoadState('networkidle').catch(() => undefined);

    const overflow = await measureOverflow(page, 360);

    if (overflow.docOverflow > 0 || overflow.offenders.length > 0) {
      bad.push(
        `${p.name}: doc +${overflow.docOverflow}px, offenders ${JSON.stringify(overflow.offenders.slice(0, 3))}`,
      );
    }
  }

  expect(bad, bad.join('\n')).toEqual([]);
});
