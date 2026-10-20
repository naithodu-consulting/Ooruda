# Supabase Database

## Schema Organization

Schemas in `schemas/` directory with numbered prefixes for dependency ordering.

## Skills

For database implementation:
- `/postgres-expert` - Schema design, RLS, migrations, testing

## Migration Workflow

### New Entities

```bash
# Create schema file
touch schemas/20-feature.sql

# Create migration
pnpm --filter web run supabase migrations new feature_name

# Copy content, apply, generate types
pnpm --filter web supabase migrations up
pnpm supabase:web:typegen
```

### Modify Existing

```bash
# Edit schema, generate diff
pnpm --filter web run supabase:db:diff -f update_feature

# Apply and regenerate
pnpm --filter web supabase migrations up
pnpm supabase:web:typegen
```

### Three-Environment Architecture

| Environment | Supabase Project | Project Ref | Used By |
|---|---|---|---|
| **Local** | Docker (local) | - | `pnpm supabase:web:start` |
| **Dev/Staging** | Ooruda Development | `bcdosjrbkkemsqowhigj` | `release` branch → ooruda.vercel.app |
| **Production** | Ooruda Production | `vkxchopjqakvftcnxwie` | `main` branch → ooruda.com |

`.env.local` controls which remote project the app points to locally. Currently defaults to **Ooruda Development**. To switch to production, swap the commented block in `.env.local`.

The currently linked Supabase project (for CLI commands) is stored in `apps/web/supabase/.temp/project-ref`.

### Remote Sync (CRITICAL - do not skip)

`apps/web/.env.local` points the app at a **remote, hosted** Supabase project, not the local instance. `pnpm --filter web supabase migrations up` only applies migrations **locally** - it does NOT touch the remote/linked project. Running, testing, and verifying a feature entirely against local Supabase can pass completely while the same feature is broken in the real app, because the remote database never received the new migration(s).

This already happened once: a full PDF-generation feature (new columns, new table, new storage bucket) was built, migrated locally, and verified working - but the remote project was never updated, so the live app errored on every download until the gap was caught and the migrations pushed.

**Before considering any schema-changing feature done:**

```bash
# Check which migrations are pending on the linked remote project
cd apps/web && supabase migration list --linked

# Push to remote using the guardrail script (NEVER run supabase db push --linked directly)
./scripts/db-push.sh              # push to Ooruda Development (default)
./scripts/db-push.sh --production # push to Ooruda Production (requires confirmation)
```

The guardrail script (`scripts/db-push.sh`) detects which project is linked and blocks accidental pushes to production. Always use it. If the CLI reports out-of-order migrations, it will ask for `--include-all` - read each pending migration's SQL before agreeing.

Always run `supabase migration list --linked` as part of verifying a schema change, not just `supabase migrations up`.

### Standard Migration Workflow (end-to-end)

```bash
# 1. Create and apply locally
pnpm --filter web run supabase migrations new feature_name
pnpm --filter web supabase migrations up
pnpm supabase:web:typegen

# 2. Verify locally, then check what's pending on remote
cd apps/web && supabase migration list --linked

# 3. Push to Ooruda Development (linked by default)
./scripts/db-push.sh

# 4. When merging to main → push to Ooruda Production
./scripts/db-push.sh --production
```

## Security Rules

- **ALWAYS enable RLS** on new tables
- **NEVER use SECURITY DEFINER** without explicit access controls
- Use existing helper functions (see `/postgres-expert` skill)

## Table Template

```sql
create table if not exists public.feature (
  id uuid unique not null default extensions.uuid_generate_v4(),
  account_id uuid references public.accounts(id) on delete cascade not null,
  created_at timestamp with time zone default now(),
  primary key (id)
);

alter table "public"."feature" enable row level security;
revoke all on public.feature from authenticated, service_role;
grant select, insert, update, delete on table public.feature to authenticated;

-- Use helper functions for policies
create policy "feature_read" on public.feature for select
  to authenticated using (
    account_id = (select auth.uid()) or
    public.has_role_on_account(account_id)
  );
```

## Commands

```bash
pnpm supabase:web:reset     # Reset database
pnpm supabase:web:typegen   # Generate TypeScript types
pnpm --filter web supabase migrations list  # View migrations
```
