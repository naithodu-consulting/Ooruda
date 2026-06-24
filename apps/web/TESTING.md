# Testing

The web app has three test layers. Only the **Vitest** layer runs without
infrastructure; the **pgTAP** and **Playwright E2E** layers need a local
Supabase instance, which in turn needs a container runtime.

| Layer            | Runner     | Needs Docker? | Command                              |
| ---------------- | ---------- | ------------- | ------------------------------------ |
| Unit / action    | Vitest     | No            | `pnpm --filter web test`             |
| Database (RLS, triggers, constraints) | pgTAP | **Yes** | `pnpm --filter web supabase:test` |
| End-to-end flows | Playwright | **Yes**       | `pnpm --filter web-e2e test`         |

---

## 1. Vitest (no infrastructure)

Pure, database-free logic — the RBAC helpers (`lib/rbac.ts`) and the
association settings server action's authorization + Zod validation.

```bash
pnpm --filter web test          # run once
pnpm --filter web test:watch    # watch mode
```

---

## 2. Prerequisite for pgTAP + E2E: a container runtime

The pgTAP and Playwright suites run against a **local Supabase** instance,
which runs in containers. You must have **Docker Desktop** or **OrbStack**
(or another Docker-compatible runtime) installed and running first.

```bash
# Start the runtime (Docker Desktop / OrbStack), then:
pnpm supabase:web:start         # starts local Supabase (Postgres, Auth, Storage)
```

Useful companions:

```bash
pnpm supabase:web:reset         # reset DB + re-apply migrations and seeds
pnpm supabase:web:stop          # stop local Supabase
```

> Without a running container runtime, `pnpm supabase:web:start` fails with
> `Cannot connect to the Docker daemon` and neither pgTAP nor E2E can run.

---

## 3. pgTAP database tests

Covers Ooruda domain rules enforced in the database: auto-provisioning
triggers, CHECK/enum constraints, uniqueness rules, generated columns, the
RBAC role/permission seed, and RLS (tenant isolation + the write-policy
matrix).

```bash
pnpm supabase:web:start          # (requires Docker — see section 2)
pnpm --filter web supabase:test  # runs supabase/tests/database/*.test.sql
```

Ooruda-specific files:

- `supabase/tests/database/ooruda-domain.test.sql`
- `supabase/tests/database/ooruda-rbac.test.sql`
- `supabase/tests/database/ooruda-rls.test.sql`

These tests create their own users/accounts inside a transaction and roll
back, so they need no manual seed data.

---

## 4. Playwright E2E tests

Covers full user flows: phone-OTP sign-in, super-admin → `/admin` routing,
and the association settings page. Ooruda specs live in
`apps/e2e/tests/ooruda/`.

### 4.1 Enable test OTPs (required for phone-OTP sign-in)

The seeded dev users all sign in with OTP `123456`. For the **local**
Supabase to accept fixed codes (instead of sending a real SMS), add a test-OTP
block to `apps/web/supabase/config.toml`:

```toml
[auth.sms]
enable_signup = true

[auth.sms.test_otp]
919911000001 = "123456"   # assoc_admin
919911000002 = "123456"   # billing_operator
919911000003 = "123456"   # prop_owner
919911000004 = "123456"   # prop_owner
919911000005 = "123456"   # tenant
919911000006 = "123456"   # platform super admin
```

Restart Supabase after editing config: `pnpm supabase:web:stop && pnpm supabase:web:start`.

> When running against the **linked cloud** project instead of local, add the
> same numbers under Authentication → Providers → Phone → "Test phone numbers"
> in the Supabase dashboard (enter them **without** the `+` prefix).

### 4.2 Seed the dev users

Create the five role-based users plus the super admin and assign them to the
`abish-association` team account:

```bash
cd apps/web
bash supabase/seeds/seed_test_users.sh
```

Requires `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and
`SUPABASE_ACCESS_TOKEN` in `apps/web/.env.local`, and the `abish-association`
team account to already exist (override the target with
`TARGET_SLUG=<slug> bash supabase/seeds/seed_test_users.sh`).

### 4.3 Run the app with mock OTP, then the tests

The sign-in UI shows the mock-OTP hint and skips real SMS when
`NEXT_PUBLIC_MOCK_OTP=true`:

```bash
# Terminal 1 — app + local Supabase running
NEXT_PUBLIC_MOCK_OTP=true pnpm --filter web dev

# Terminal 2 — run the E2E suite (expects the app on http://localhost:3000)
pnpm --filter web-e2e test

# …or just the Ooruda specs:
pnpm --filter web-e2e exec playwright test tests/ooruda --workers=1
```

Playwright can also start the server itself via the `PLAYWRIGHT_SERVER_COMMAND`
env var (see `apps/e2e/playwright.config.ts`).

---

## Summary of what's covered

Ooruda tests target the **implemented** surfaces only: RBAC, the association
settings action/page, phone-OTP auth, and the database layer (RLS, triggers,
constraints). Domain areas still rendered as `ComingSoonState` (units,
billing, payments, MESCOM, reports, audit, notifications) have no business
logic yet and are intentionally not covered until they are built.
