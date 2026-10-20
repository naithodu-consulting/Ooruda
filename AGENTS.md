# Makerkit SaaS Starter

## Tech Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Supabase** (Postgres, Auth, Storage)
- **Tailwind CSS 4** + Shadcn UI
- **Turborepo** monorepo

## Monorepo Structure

| Directory           | Purpose                       | Details                           |
| ------------------- | ----------------------------- | --------------------------------- |
| `apps/web`          | Main Next.js app              | See `apps/web/AGENTS.md`          |
| `apps/web/supabase` | Database schemas & migrations | See `apps/web/supabase/AGENTS.md` |
| `apps/e2e`          | Playwright E2E tests          | See `apps/e2e/AGENTS.md`          |
| `packages/ui`       | UI components (@kit/ui)       | See `packages/ui/AGENTS.md`       |
| `packages/supabase` | Supabase clients              | See `packages/supabase/AGENTS.md` |
| `packages/next`     | Next.js utilities             | See `packages/next/AGENTS.md`     |
| `packages/features` | Feature packages              | See `packages/features/AGENTS.md` |

<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in `apps/web/node_modules/next/dist/docs/`. Your training data is outdated - the docs are the source of truth.

<!-- END:nextjs-agent-rules -->

## Multi-Tenant Architecture

- **Personal Accounts**: `auth.users.id = accounts.id`
- **Team Accounts**: Shared workspaces with members, roles, permissions
- Data links to accounts via `account_id` foreign key

## Essential Commands

```bash
pnpm dev                          # Start development
pnpm supabase:web:start           # Start local Supabase
pnpm supabase:web:reset           # Reset database
pnpm supabase:web:typegen         # Generate TypeScript types
pnpm typecheck                    # Type check
pnpm lint:fix                     # Fix linting
pnpm format:fix                   # Format code
```

## Key Patterns (Quick Reference)

| Pattern        | Import                                                       | Details                       |
| -------------- | ------------------------------------------------------------ | ----------------------------- |
| Server Actions | `authActionClient` from `@kit/next/safe-action`              | `packages/next/AGENTS.md`     |
| Route Handlers | `enhanceRouteHandler` from `@kit/next/routes`                | `packages/next/AGENTS.md`     |
| Server Client  | `getSupabaseServerClient` from `@kit/supabase/server-client` | `packages/supabase/AGENTS.md` |
| UI Components  | `@kit/ui/{component}`                                        | `packages/ui/AGENTS.md`       |
| Translations   | `Trans` from `@kit/ui/trans`                                 | `packages/ui/AGENTS.md`       |

## Authorization

- **RLS enforces access control** - no manual auth checks needed with standard client
- **Admin client** (`getSupabaseServerAdminClient`) bypasses RLS - use sparingly with manual validation

## Verification

After implementation, always run:

1. `pnpm typecheck`
2. `pnpm lint:fix`
3. `pnpm format:fix`
4. Run /reviewer skill

## Release Notes

**REQUIRED before every push:** Update `RELEASE_NOTES.md` with a summary of all changes in the current batch - new features, bug fixes, migrations, and UX changes. Add new migrations to the Migrations Changelog table. Update the `Last updated` date at the bottom.

## Deployment & Environment Setup

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the full guide covering:
- Three-environment architecture (local / staging / production)
- Local dev setup and `.env.local` configuration
- Database migration workflow and the `./scripts/db-push.sh` guardrail
- Vercel project mapping (branch → environment)
- Pre-push checklist

## Git Workflow Constraints

- **CRITICAL RULE:** Never perform any Git commands (such as `git add`, `git commit`, `git checkout`, `git merge`, or `git push/pull`) without obtaining the user's explicit permission first. Always ask the user first and wait for approval.
- **BRANCHING RULE:** When explicitly asked to commit and push to a specific branch, DO THAT ONLY. Do not update or merge into other branches (e.g., to keep them up to date) unless explicitly asked to do so, to avoid accidentally propagating feature branch bugs to the main branch.
