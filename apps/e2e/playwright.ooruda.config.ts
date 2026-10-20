import { defineConfig, devices } from '@playwright/test';

/**
 * Ooruda regression suite (tests/ooruda/regression).
 *
 * Runs against a local app backed by local Supabase with the phone test OTPs
 * from supabase/config.toml. Point it at the dev server or a production
 * build:
 *
 *   OORUDA_BASE_URL=http://localhost:3002 pnpm exec playwright test \
 *     -c playwright.ooruda.config.ts
 *
 * Kept separate from playwright.config.ts, whose MakerKit specs assume
 * email/password sign-in.
 */
export default defineConfig({
  testDir: './tests/ooruda/regression',
  fullyParallel: true,
  workers: 4,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['json', { outputFile: 'ooruda-results.json' }]],
  use: {
    baseURL: process.env.OORUDA_BASE_URL ?? 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    navigationTimeout: 45_000,
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'regression',
      testMatch: /.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
});
