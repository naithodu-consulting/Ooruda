# @kit/mailers - Email Service

## Non-Negotiables

1. ALWAYS use `getMailer()` factory from `@kit/mailers` - never instantiate mailer directly
2. ALWAYS use `@kit/email-templates` renderers for HTML - never write inline HTML
3. ALWAYS render template first (`renderXxxEmail()`), then pass `{ html, subject }` to `sendEmail()`
4. NEVER hardcode sender/recipient addresses - use environment config

## Workflow

1. Render: `const { html, subject } = await renderXxxEmail(props)`
2. Get mailer: `const mailer = await getMailer()`
3. Send: `await mailer.sendEmail({ to, from, subject, html })`

## Exemplars

- Contact form: `apps/web/app/[locale]/(marketing)/contact/_lib/server/server-actions.ts`
- Invitation dispatch: `packages/features/team-accounts/src/server/services/account-invitations-dispatcher.service.ts`
