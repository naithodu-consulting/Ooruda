# Ooruda — Deployment

## Vercel (frontend / Next.js app)

Ooruda is a pnpm + Turborepo monorepo with **two** Next.js apps: `apps/web`
(the product) and `apps/dev-tool` (internal). Vercel must be pointed at
`apps/web` via the project's **Root Directory** setting — otherwise its Turbo
auto-detection may pick the wrong app and the build fails with
`The Next.js output directory ".next" was not found at .../apps/dev-tool/.next`.

There is intentionally **no `vercel.json`** — with Root Directory = `apps/web`,
Vercel auto-detects Next.js and generates the correct Turbo build
(`turbo run build --filter={apps/web}...`), installing workspace deps from the
repo root.

### One-time setup

1. Push this repo to GitHub (if not already).
2. In the Vercel dashboard → **Add New… → Project** → import the repo.
3. **CRITICAL — set Root Directory to `apps/web`**: during import expand
   **Root Directory → Edit → select `apps/web`**. (If you already imported,
   fix it at **Project → Settings → Build & Deployment → Root Directory →
   `apps/web` → Save**, then redeploy.) Keep **"Include files outside the root
   directory"** enabled (default) so workspace packages resolve.
4. Framework preset: **Next.js** (auto-detected). Leave Build/Install commands
   on their defaults — Vercel's Turbo detection handles them.
5. Add the environment variables below under **Project → Settings →
   Environment Variables** (Production + Preview).
6. Deploy. Every push to a branch then gets a **preview** URL; merges to the
   default branch publish **production**.

### CLI alternative

```bash
pnpm dlx vercel@latest login        # authenticate (interactive — you run this)
pnpm dlx vercel@latest link         # link this dir to a Vercel project
pnpm dlx vercel@latest              # deploy a preview
pnpm dlx vercel@latest --prod       # deploy production
```

### Required environment variables

Copy values from `apps/web/.env.local` (do NOT commit them). Public vars are
safe to expose; the others are server-only secrets — set them as encrypted
Vercel env vars.

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public |
| `NEXT_PUBLIC_SUPABASE_PUBLIC_KEY` | public (anon/publishable key) |
| `SUPABASE_SECRET_KEY` | secret — server only |
| `SUPABASE_DB_WEBHOOK_SECRET` | secret |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USER` / `EMAIL_PASSWORD` / `EMAIL_SENDER` / `EMAIL_TLS` / `MAILER_PROVIDER` | secret — transactional email |
| `CONTACT_EMAIL` | config |

Plus the public config vars from `apps/web/.env`
(`NEXT_PUBLIC_PRODUCT_NAME`, auth flags, feature flags, etc.) — Vercel does not
read `.env`, so they must be re-entered (or kept in `.env` which IS committed
and read at build time; confirm which vars live where before relying on it).

> **Note:** `SUPABASE_ACCESS_TOKEN` is a CLI/admin token for `supabase`
> commands — it is **not** needed by the running app and should not be added to
> Vercel.

### SMS / OTP note

Real-number OTP delivery runs through the deployed Supabase Edge Function
(`custom-sms-hook` → 2Factor), configured via **Supabase** function secrets —
**not** Vercel env vars. `SMS_PROVIDER` / `MOCK_OTP` / `TWOFACTOR_API_KEY` live
in Supabase (`supabase secrets`), so the Vercel app needs no SMS config.

## Supabase (backend)

Already linked and deployed (project `vkxchopjqakvftcnxwie`): migrations via
`supabase db push --linked`, Edge Function via `supabase functions deploy`.
