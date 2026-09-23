# Ooruda - Supabase & Next.js SaaS Platform

Ooruda is a premium Software-as-a-Service (SaaS) application built for housing association and property management. It is designed using a multi-tenant architecture on top of Next.js 16 (App Router), Supabase (Postgres, Auth, Storage), Tailwind CSS 4, and Turborepo.

---

## 🚀 Core Features

- **Phone-OTP Authentication**: Tailored authentication utilizing Supabase Auth combined with SMS gateways (like Twilio or 2Factor APIs) for a secure, passwordless sign-in experience.
- **Multi-Tenant Workspace Structure**:
  - **Personal Accounts**: Individual workspaces mapping directly to single users (`auth.users.id` = `accounts.id`).
  - **Team Accounts / Associations**: Shared workspaces representing physical property associations (e.g., apartment blocks or housing societies) linked with members, roles, and permissions.
- **Granular Role-Based Access Control (RBAC)**:
  - `super-admin`: Platform-wide administrator with control over dashboards, user accounts, subscription metrics, and association creation.
  - `assoc_admin`: Association Admin owning and managing the settings and memberships of their team/association.
  - `billing_operator`: Association operator responsible for billing, receipts, and invoices.
  - `prop_owner`: Property Owner within an association.
  - `tenant`: Tenant occupying a property within an association.
- **Super Admin Panel (`/admin`)**:
  - Full visibility into platform accounts, subscriptions, and memberships.
  - Create new users and associations.
  - Impersonate, ban, reactivate, or delete user accounts.
  - Manage memberships: add members, remove members, or change roles within associations.
- **Danger Zone Actions**: Destructive actions (like deleting team accounts) are sequestered in dedicated Warning Cards at the bottom of the page to prevent accidental deletions.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, Server Actions, Dynamic rendering)
- **UI & State**: [React 19](https://react.dev/), [Shadcn UI](https://ui.shadcn.com/), and [Tailwind CSS 4](https://tailwindcss.com/)
- **Database & Auth**: [Supabase](https://supabase.com/) (PostgreSQL, Realtime, Storage, Edge Functions, Row-Level Security)
- **Build System**: [Turborepo](https://turbo.build/repo) + [pnpm](https://pnpm.io/)
- **Linting & Formatting**: [oxlint](https://github.com/web-infra-dev/oxc) and [oxfmt](https://github.com/web-infra-dev/oxc) for extremely fast checking and auto-fixing.

---

## 📂 Monorepo Structure

| Directory | Purpose | Detail |
|---|---|---|
| `apps/web` | Main Next.js Product App | Contains marketing pages, auth, user workspaces, and super-admin panels. |
| `apps/web/supabase` | Backend Migrations & Config | Handles local database schemas, seeds, and migration logic. |
| `apps/e2e` | Playwright E2E Tests | End-to-end testing scripts. |
| `packages/ui` | Core Component Library | Design system elements (`@kit/ui`) styled with Tailwind and CSS variables. |
| `packages/supabase` | Supabase Clients & SDK | Preconfigured Supabase hooks, browser clients, and server clients. |
| `packages/next` | Next.js Utilities | Safe action clients (`authActionClient`) and enhancements for route handlers. |
| `packages/features` | Shared Feature Modules | Domain modules (e.g., `admin`, `accounts`, `auth`, `billing`, `team-accounts`). |

---

## 💻 Local Development

### 1. Prerequisites
- **Node.js**: `v20.10.0` or higher
- **pnpm**: `v9.15.0` or higher
- **Docker**: Required to run local Supabase containers

### 2. Initial Setup
Clone the repository and install the dependencies:
```bash
pnpm install
```

### 3. Local Supabase Backend
Start the local Supabase environment (launches PostgreSQL, Auth, and Storage locally inside Docker):
```bash
pnpm supabase:web:start
```

To reset the database, apply migrations, and run seed files:
```bash
pnpm supabase:web:reset
```

Generate TypeScript types for your Supabase database:
```bash
pnpm supabase:web:typegen
```

### 4. Running the Development Servers
Start Next.js and Tailwind dev server:
```bash
pnpm dev
```
The app will be accessible at `http://localhost:3000`.

---

## 🏗️ Key Development Patterns

### Supabase Clients
- **Server Components & Actions**: Use `getSupabaseServerClient()` from `@kit/supabase/server-client`. Row-Level Security (RLS) is automatically enforced based on the session token.
- **Client Components**: Use the `useSupabase()` hook from `@kit/supabase/hooks`.
- **System Admin / Bypassing RLS**: Use `getSupabaseServerAdminClient()` from `@kit/supabase/server-admin-client` when performing actions that bypass RLS (e.g., in a background job or admin actions). *Ensure manual validation is done first.*

### Server Actions
Actions are written using `authActionClient` from `@kit/next/safe-action` to ensure type-safe parameters, parsed input validations (using Zod schemas), and automatic authentication checks.
```typescript
import { authActionClient } from '@kit/next/safe-action';
import { z } from 'zod';

export const myAction = authActionClient
  .inputSchema(z.object({ id: z.string().uuid() }))
  .action(async ({ parsedInput: { id }, ctx }) => {
     // ctx.user contains the authenticated caller
  });
```

---

## 🧪 Quality and Verification

Before pushing code, run the verification commands:

```bash
pnpm typecheck    # Run compiler checks
pnpm lint:fix     # Fix lint errors with oxlint
pnpm format:fix   # Format code with oxfmt
```

---

## 🌐 Deployment

Deployment consists of deploying the frontend Next.js application to Vercel and linking migrations/Edge functions to Supabase.

Detailed deployment instructions, required environment variables, and SMS/OTP configurations are listed in [DEPLOYMENT.md](file:///Users/prashanthnbhat/projects/PropTech/DEPLOYMENT.md).