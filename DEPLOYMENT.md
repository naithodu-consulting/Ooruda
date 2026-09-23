# Ooruda - Deployment Guide

This guide covers everything a new developer needs to understand the environment setup, run the app locally, push database migrations safely, and deploy to staging or production.

---

## Architecture Overview

Ooruda runs across three environments, each with its own Supabase database:

| Environment | Supabase Project | Ref | Vercel Project | Branch | URL |
|---|---|---|---|---|---|
| **Local** | Docker (local) | - | - | any | `http://localhost:3000` |
| **Staging / Dev** | Ooruda Development | `bcdosjrbkkemsqowhigj` | prop-tech-dev-tool | `release` | ooruda.vercel.app |
| **Production** | Ooruda Production | `vkxchopjqakvftcnxwie` | ooruda | `main` | ooruda.com |

**Rule:** feature branches target `release` → staging. Only `main` touches production.

---

## Local Development Setup

### 1. Prerequisites

- Node.js 20+, pnpm 9+
- Docker (for local Supabase)
- Supabase CLI (`brew install supabase/tap/supabase`)

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment

`.env.local` is gitignored and must be created manually. By default it points at **Ooruda Development** (staging). Ask the project owner for the values - the file lives at `apps/web/.env.local` and contains:

```
NEXT_PUBLIC_SUPABASE_URL=         # Ooruda Development URL
NEXT_PUBLIC_SUPABASE_PUBLIC_KEY=  # Ooruda Development anon key
SUPABASE_SECRET_KEY=              # Ooruda Development service role key
SUPABASE_ACCESS_TOKEN=            # Your personal Supabase access token (CLI only)
RESEND_API_KEY=                   # Transactional email
RAZORPAY_KEY_ID=                  # Razorpay test key
RAZORPAY_KEY_SECRET=              # Razorpay test secret
SUPABASE_DB_WEBHOOK_SECRET=       # Webhook validation secret
ACCESS_PIN=                       # Early access gate PIN
```

To point locally at production instead, swap the commented block in `.env.local`.

### 4. Start local Supabase (optional)

Only needed if you want a fully offline local DB. Most developers work directly against Ooruda Development (staging).

```bash
pnpm supabase:web:start   # starts local Docker Supabase
pnpm supabase:web:reset   # reset local DB to migration baseline
```

### 5. Start the app

```bash
pnpm dev
```

---

## Branch → Environment Mapping

```
feature-branch  →  develop locally against Ooruda Development
      ↓
   release      →  auto-deploys to ooruda.vercel.app (Ooruda Development DB)
      ↓
    main        →  auto-deploys to ooruda.com (Ooruda Production DB)
```

**Never push DB migrations directly to production without first validating on staging.**

---

## Database Migrations

### Creating a migration

```bash
# 1. Create the migration file
pnpm --filter web run supabase migrations new your_feature_name

# 2. Write your SQL in apps/web/supabase/migrations/<timestamp>_your_feature_name.sql

# 3. Apply locally and regenerate TypeScript types
pnpm --filter web supabase migrations up
pnpm supabase:web:typegen
```

### Pushing to Ooruda Development (staging)

Always use the guardrail script - never run `supabase db push --linked` directly.

```bash
# First check what's pending on the linked remote
cd apps/web && supabase migration list --linked

# Push safely
./scripts/db-push.sh
```

The script reads `apps/web/supabase/.temp/project-ref` to detect which project is linked. If it's pointing at production, the push is blocked automatically.

### Pushing to Ooruda Production

```bash
# 1. Re-link the CLI to the production project
cd apps/web && supabase link   # enter production project ref when prompted

# 2. Verify what's pending
supabase migration list --linked

# 3. Push - requires typing "yes" at the confirmation prompt
./scripts/db-push.sh --production

# 4. Re-link back to Ooruda Development when done
supabase link   # enter dev project ref
```

### Supabase CLI linking

```bash
# Link to Ooruda Development (default for day-to-day work)
cd apps/web && supabase link
# Project ref: bcdosjrbkkemsqowhigj

# Link to Ooruda Production (only when pushing prod migrations)
cd apps/web && supabase link
# Project ref: vkxchopjqakvftcnxwie
```

---

## Edge Functions

Edge functions live in `apps/web/supabase/functions/`. Deploy them per-environment:

```bash
# Deploy to Ooruda Development (must be linked to dev)
cd apps/web && supabase functions deploy custom-sms-hook

# Deploy to Ooruda Production (must be linked to prod)
cd apps/web && supabase functions deploy custom-sms-hook
```

Secrets for edge functions are managed via `supabase secrets set` - not via `.env.local` or Vercel. See `apps/web/supabase/functions/custom-sms-hook/index.ts` for which secrets are required.

---

## Vercel Projects

Two Vercel projects exist under the `naithodu` team:

| Vercel Project | Deploys | Branch | Supabase |
|---|---|---|---|
| `prop-tech-dev-tool` | ooruda.vercel.app | `release` | Ooruda Development |
| `ooruda` | ooruda.com | `main` | Ooruda Production |

Each project has its own environment variables in the Vercel dashboard (Settings → Environment Variables). The `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLIC_KEY`, and `SUPABASE_SECRET_KEY` are set per-project to point at the correct database - no code change or `.env.production` file is needed.

**Root Directory:** Both projects are configured with Root Directory = `apps/web`. Do not change this.

**`SUPABASE_ACCESS_TOKEN`** is a CLI token - it belongs in `.env.local` only, not in Vercel.

---

## SMS / OTP

OTP delivery uses Supabase Auth Hooks → `custom-sms-hook` edge function → 2Factor API. This is configured entirely within Supabase (function secrets + auth hook wiring) - no SMS config is needed in Vercel or `.env.local`. Test phone numbers (`919911000xxx` and `919999999xxx` series) bypass the SMS provider via Supabase's test phone list.

---

## Pre-Push Checklist

Before pushing any change:

- [ ] `pnpm typecheck` - no type errors
- [ ] `pnpm lint:fix` - no lint errors
- [ ] `pnpm format:fix` - code formatted
- [ ] If schema changed: `./scripts/db-push.sh` pushed to staging and verified
- [ ] `RELEASE_NOTES.md` updated with new section + migrations table + date
- [ ] If merging to `main`: `./scripts/db-push.sh --production` pushed to Ooruda Production
