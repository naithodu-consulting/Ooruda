# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product

**Ooruda** is a PropTech SaaS for commercial property associations. It manages units, tenancies, electricity sub-metering, bill generation, payments, receipts, a per-unit cash ledger, and a Razorpay-integrated payment flow. One Makerkit **team account = one association** (1:1 mapping).

**Roles:** `assoc_admin` (full access), `billing_operator` (billing/electricity only), `prop_owner` (view own bills/pay), `tenant` (view own bills/pay). Platform **super-admin** stored in JWT `app_metadata.role`. There is **no `owner` role** — it was renamed to `assoc_admin`.

## Tech Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Supabase** (Postgres, Auth, Storage)
- **Tailwind CSS 4** + Shadcn UI (Base UI, NOT Radix UI)
- **Turborepo** monorepo

## Monorepo Structure

| Directory           | Purpose                       | AGENTS.md                         |
| ------------------- | ----------------------------- | --------------------------------- |
| `apps/web`          | Main Next.js app              | `apps/web/AGENTS.md`              |
| `apps/web/supabase` | Migrations & schemas          | `apps/web/supabase/AGENTS.md`     |
| `apps/e2e`          | Playwright E2E tests          | `apps/e2e/AGENTS.md`              |
| `packages/ui`       | UI components (`@kit/ui`)     | `packages/ui/AGENTS.md`           |
| `packages/supabase` | Supabase clients              | `packages/supabase/AGENTS.md`     |
| `packages/next`     | Server actions & route utils  | `packages/next/AGENTS.md`         |
| `packages/features` | Auth, accounts, notifications | `packages/features/AGENTS.md`     |

## Route Layout (`apps/web/app/[locale]/`)

```
(marketing)/      Public pages
(auth)/           Authentication
home/
  (user)/         Personal account workspace
  [account]/      Team account workspace (slug, not ID)
admin/            Super-admin panel
api/              Route handlers
```

Route-specific components live in `_components/`, utilities in `_lib/` (client) and `_lib/server/` (server).

## Essential Commands

```bash
pnpm dev                          # Start development
pnpm supabase:web:start           # Start local Supabase (requires Colima, not Docker Desktop)
pnpm supabase:web:reset           # Reset local database
pnpm supabase:web:typegen         # Regenerate TypeScript types after migrations
pnpm typecheck                    # Type-check all 23 packages
pnpm lint:fix                     # Fix linting
pnpm format:fix                   # Format code (oxfmt — large whitespace-only diffs are normal)
```

**If `supabase:web:start` fails:** run `colima start` first (Docker runtime is Colima, not Docker Desktop).

**If Turbopack crashes with `FATAL: An unexpected Turbopack error occurred`:** `rm -rf apps/web/.next` then restart. Never delete `.next` while the dev server is running.

## Next.js

Always find and read the relevant doc in `apps/web/node_modules/next/dist/docs/` before Next.js work — training data is outdated.

```typescript
// Next.js 16: await params directly
async function Page({ params }: Props) {
  const { account } = await params;
}
```

## Key Patterns

| Pattern        | Import                                                       |
| -------------- | ------------------------------------------------------------ |
| Server Actions | `authActionClient` from `@kit/next/safe-action`              |
| Route Handlers | `enhanceRouteHandler` from `@kit/next/routes`                |
| Server Client  | `getSupabaseServerClient` from `@kit/supabase/server-client` |
| UI Components  | `@kit/ui/{component}`                                        |
| Translations   | `Trans` from `@kit/ui/trans`                                 |
| Class merging  | `cn` from `@kit/ui/utils`                                    |
| Logging        | `getLogger` from `@kit/shared/logger` — never `console.log` |

**Server actions:** mutations only, never data fetching. Always validate with Zod `.inputSchema()`. Always `revalidatePath` after mutations. Business logic goes in service files, not in the action itself.

**Data fetching:**
- Server Components (default): `getSupabaseServerClient()` — RLS enforced
- Client Components: `useSupabase()` hook with React Query
- Admin client (`getSupabaseServerAdminClient`): bypasses RLS — requires manual auth check, use sparingly

## Authorization

RLS enforces access control. No manual auth checks needed with the standard client. RLS policies must use the `association_role(association_id)` helper function — never direct `memberships` joins.

`isSuperAdmin()` check + `AdminGuard` wrapper required for all admin operations.

## UI Conventions

- **Semantic Tailwind tokens only** — `bg-background`, `text-muted-foreground`, `bg-card`, etc. Never hardcoded colors (`bg-white`, `text-gray-500`, hex values, arbitrary `slate-*`/`emerald-*`).
- **Base UI, not Radix UI** — use `render` prop for element composition, never `asChild`.
- All `@kit/ui` imports use the short form: `@kit/ui/<name>` (no deep paths).
- Do not edit files in `packages/ui/src/shadcn/` — those mirror upstream shadcn and may be overwritten. Extend in `src/makerkit/` instead.
- Add `data-test` attributes on all interactive elements.
- Every form field needs `FormMessage` for error display.
- Always use `useWatch` hook, never `watch()` from react-hook-form.
- Zod: `import * as z from 'zod'`. Place schemas in separate files for server-action reuse.
- **Every UI change must be responsive** — mobile (360px+), tablet, desktop. Use Tailwind responsive prefixes.

**Background fix (critical):** The global canvas token `--background` is warm cream `#fffdf5`. Any card container needs explicit `bg-card` (`#ffffff`) to appear white. Never rely on the absence of a background.

## Critical Domain Gotchas

### Phone numbers
- App standard: **E.164 `+91XXXXXXXXXX`** at all write paths.
- `auth.users.phone` stores **without** `+` (`919…`); `profiles.mobile_number` stores **with** `+` (`+919…`). When querying `auth.users` by phone, use the no-`+` form. Match by `id` wherever possible.
- `normalizePhoneNumber` uses `libphonenumber-js`. The old `normalizeIndianPhone` is gone.

### Billing
- Outstanding = `total_amount − paid_amount − advance_applied`. Forgetting `advance_applied` yields "Paid status but ₹X outstanding" bugs.
- Overdue status is DB-stamped by cron `recompute_overdue_bills()`, not client-derived. Filters must match DB status values.
- `displayBillStatus()` must be used for all status filter matching.
- Date comparisons: `new Date('YYYY-MM-DD')` parses as UTC midnight, shifting one day in IST. Use `todayInBillingZone()` for date comparisons or date-only string comparisons.

### Postgres
- **Never `CREATE OR REPLACE` a security function** without reading the existing definition and diffing. A one-line change can silently clobber a security decision from a prior migration (see `is_super_admin()` incident in `OORUDA_KNOWLEDGE.md §9b`).
- **Always `CREATE INDEX CONCURRENTLY`** in production migrations. Plain `CREATE INDEX` takes a `ShareLock` blocking all writes.
- **Function overloads are dangerous.** Adding params creates a new overload; ambiguous calls throw "could not choose best candidate function". Either drop the old overload or pass explicit `null`s.
- `has_role_on_account`, `has_permission`, `is_account_owner`, `is_team_member`, `is_super_admin` are SQL helper functions in `public`.

### Supabase types
Never edit `database.types.ts` manually. Regenerate with `pnpm supabase:web:typegen` after migrations. Use `Tables<'table_name'>` from `@kit/supabase/database` for type references.

### Performance pattern
Server component fetches initial data → passes to client component which seeds `useState` + skips first `useEffect` via `useRef(true)` guard. Use `Promise.all` for parallel queries — serial fetches are a common source of latency.

## Migration Workflow

```bash
# Create + apply locally
pnpm --filter web run supabase migrations new feature_name
pnpm --filter web supabase migrations up
pnpm supabase:web:typegen

# Push to dev/staging
cd apps/web && supabase migration list --linked   # verify pending
./scripts/db-push.sh

# Push to production (only when merging to main)
cd apps/web && supabase link                       # enter prod ref: vkxchopjqakvftcnxwie
./scripts/db-push.sh --production                  # type "yes" at prompt
cd apps/web && supabase link                       # re-link back to dev ref: bcdosjrbkkemsqowhigj
```

**NEVER run `supabase db push --linked` directly.** Always use `./scripts/db-push.sh`.

Out-of-order local migrations: `pnpm --filter web supabase migrations up --include-all`.

## Three-Environment Architecture

| Environment    | Supabase Project Ref   | Vercel Project    | Branch    |
| -------------- | ---------------------- | ----------------- | --------- |
| Local          | Docker (Colima)        | —                 | any       |
| Dev / Staging  | `bcdosjrbkkemsqowhigj` | `prop-tech-dev-tool` | `release` |
| Production     | `vkxchopjqakvftcnxwie` | `ooruda`          | `main`    |

Default linked project is Dev. Always re-link back to dev after touching prod.

## Verification Checklist

After every implementation:

1. `pnpm typecheck`
2. `pnpm lint:fix`
3. `pnpm format:fix`
4. Run `/reviewer` skill
5. Check/push migrations to remote (`./scripts/db-push.sh`)
6. Update `RELEASE_NOTES.md` (new section + migrations table + today's date) before any push

## Git Workflow Constraints

- **Never run any git command** (`git add`, `git commit`, `git checkout`, `git merge`, `git push/pull`) without the user's explicit permission. Ask first and wait for a yes.
- When told to push to branch X, touch **only** branch X.
- No Claude/model references or `Co-Authored-By` trailers in commit messages.
- Default working branch is **`main`** unless explicitly told otherwise.

## Internal Reference

`OORUDA_KNOWLEDGE.md` (gitignored) is the durable internal knowledge base for all project-specific decisions, bugs fixed, domain logic, and operational gotchas. Read it when starting a new feature or when hitting anything unexpected. It is the fast-context file for this project.
