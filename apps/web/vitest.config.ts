import { defineConfig } from 'vitest/config';

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

/**
 * Vitest config for the web app's pure unit / server-action tests.
 *
 * Scope: interface-agnostic business logic that runs without a database -
 * RBAC helpers (`lib/rbac.ts`) and the association settings server action's
 * authorization + Zod validation. DB-backed behaviour (RLS, triggers,
 * constraints) is covered by the pgTAP suite under `supabase/tests/database`,
 * and full user flows by the Playwright suite in `apps/e2e`.
 */
// `import 'server-only'` is a Next.js RSC guard with no runtime behaviour in a
// plain Node test process; the `~/*` aliases mirror the tsconfig path mappings
// used by the source modules under test.
const alias = [
  { find: /^server-only$/, replacement: resolve(root, 'test/empty-module.ts') },
  { find: '~/lib', replacement: resolve(root, 'lib') },
  { find: '~/config', replacement: resolve(root, 'config') },
  { find: '~/components', replacement: resolve(root, 'components') },
];

export default defineConfig({
  resolve: { alias },
  // Config modules such as the sidebar nav hold JSX icons; use the automatic
  // runtime (as Next.js does) so they can be imported without a React global.
  esbuild: { jsx: 'automatic' },
  test: {
    alias,
    environment: 'node',
    globals: true,
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules/**', '.next/**', 'supabase/**', '.turbo/**'],
  },
});
