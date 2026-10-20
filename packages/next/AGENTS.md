# @kit/next - Next.js Utilities

## Non-Negotiables

1. ALWAYS validate input with Zod schema via `.inputSchema()`
2. ALWAYS use `authActionClient` for authenticated actions, `publicActionClient` for public
3. ALWAYS use `useAction` hook from `next-safe-action/hooks` on the client side
4. ALWAYS use `revalidatePath` after mutations
5. NEVER use server actions for data fetching - mutations only
6. NEVER put business logic in actions - extract to service files
7. NEVER use `router.refresh()` or `router.push()` after server actions
8. NEVER use `adminActionClient` outside admin features - use `authActionClient`

## Skills

- `/server-action-builder` - Complete server action workflow

## Quick Reference

| Function              | Import                  | Purpose                            |
| --------------------- | ----------------------- | ---------------------------------- |
| `authActionClient`    | `@kit/next/safe-action` | Authenticated server actions       |
| `publicActionClient`  | `@kit/next/safe-action` | Public server actions (no auth)    |
| `captchaActionClient` | `@kit/next/safe-action` | Server actions with CAPTCHA + auth |
| `enhanceRouteHandler` | `@kit/next/routes`      | API routes with auth + validation  |

## Exemplars

- Server action: `packages/features/accounts/src/server/personal-accounts-server-actions.ts`
- Route handler: `apps/web/app/[locale]/home/[account]/members/policies/route.ts`
- Client usage: `apps/web/app/[locale]/(marketing)/contact/_components/contact-form.tsx`
