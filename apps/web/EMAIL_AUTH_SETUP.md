# Email OTP Login — Setup Guide

Email OTP is the **secondary** login channel (phone OTP is primary). A single
`auth.users` row carries both phone and email, so either channel signs the user
into the same account.

## How the email OTP flow actually works

There are two places in the app that send an email OTP:

| Trigger | Who | API call | `verifyOtp` type |
|---|---|---|---|
| Complete-profile page | Phone-only users adding their email for the first time | `updateUser({ email })` | `email_change` |
| Profile → Login & Security | Authenticated users changing their email | `updateUser({ email })` | `email_change` |

Both flows use Supabase's **email-change** path, not `signInWithOtp`.
GoTrue sends a 6-digit code to the new address using the
`[auth.email.template.email_change]` template (`supabase/templates/change-email-address.html`,
which contains `{{ .Token }}`).

There is **no email-based sign-in screen** — sign-in is phone-only
(`PhoneOtpSignInContainer`).

## Local development — no SMTP needed

Supabase's local stack captures every auth email in **Inbucket** instead of
sending it. After triggering an email OTP (e.g. from the complete-profile page):

1. Open Inbucket at <http://localhost:54324> (or the Studio Auth logs at
   <http://localhost:54323>).
2. Read the 6-digit code from the "Confirm your email change" email.

The OTP code is rendered from `supabase/templates/change-email-address.html`
(contains `{{ .Token }}`), wired via `[auth.email.template.email_change]` in
`supabase/config.toml`.

## Production (hosted Supabase project) — Gmail SMTP (simplest)

This mirrors the approach used in the financemacha project: point Supabase
Custom SMTP at a Gmail account. No domain verification or DNS records required.

> Volume caps: free Gmail ≈ 500 emails/day, Google Workspace ≈ 2,000/day. Fine
> for early/low volume. To scale later, swap the SMTP credentials for Resend /
> SES / Postmark in the same dashboard screen — **no code change** is needed,
> since we use native `updateUser` either way.

### Step 1 — Create a Gmail App Password

1. On the Google account, enable **2-Step Verification**
   (Google Account → Security).
2. Google Account → Security → **App passwords** → generate one for "Mail".
   Copy the 16-character password.

### Step 2 — Configure Custom SMTP in Supabase

Dashboard → your project → **Authentication → Emails → SMTP Settings** →
enable **Custom SMTP**:

| Field        | Value                        |
| ------------ | ---------------------------- |
| Sender email | the Gmail address            |
| Sender name  | Ooruda (or your product name)|
| Host         | `smtp.gmail.com`             |
| Port         | `587`                        |
| Username     | the Gmail address            |
| Password     | the App Password from Step 1 |

Save.

### Step 3 — Configure the Email provider

Dashboard → **Authentication → Sign In / Providers → Email**:

- Toggle the **Email** provider **on**.
- **Confirm email** → **ON** (`enable_confirmations = true`). GoTrue will send
  the OTP code to the new address before accepting the change.
- **Secure email change** → **OFF** (`double_confirm_changes = false`). This
  means only the **new** email address receives the confirmation code (no
  second code to the old address). Must be off because phone-only users have no
  old email, and users changing address may have lost access to the old one —
  double-confirm would dead-end both cases.
- **Enable email sign up** → **OFF** (`enable_signup = false` under
  `[auth.email]`). Email is only for adding/changing email on existing
  phone-authenticated accounts, never for new account creation.

### Step 4 — Email templates

Two templates need to be updated in the dashboard. Both are already written and
live in `supabase/templates/`. They use the Ooruda logo from Supabase Storage — the same asset as in
`public/images/brand/`, uploaded to a public `assets` bucket so Supabase's
sending servers can load it without depending on the app being deployed.

**Change Email Address** — Dashboard → **Authentication → Email Templates →
Change Email Address**. This is the template GoTrue uses when
`updateUser({ email })` is called. Paste the contents of
`supabase/templates/change-email-address.html`. It contains `{{ .Token }}` (the
6-digit code), `{{ .Email }}`, `{{ .NewEmail }}`, and `{{ .ConfirmationURL }}`
(the fallback button link).

**Magic Link / OTP** — Dashboard → **Authentication → Email Templates → Magic
Link or OTP**. Paste the contents of `supabase/templates/otp.html`. This
template is wired via `[auth.email.template.magic_link]` in `config.toml`. It
contains only `{{ .Token }}` since magic-link login is disabled in the app
(`NEXT_PUBLIC_AUTH_MAGIC_LINK=false`) — the template is kept branded for
completeness and future use.

### Step 5 — Rate limits & URLs

- **Authentication → Rate Limits** → set a sane "OTP / emails per hour" cap.
- **Authentication → URL Configuration** → confirm the production domain is in
  the allow-list.

## Notes

- There is no Supabase "test email OTP" feature (test OTPs exist only for phone
  numbers). To exercise the email channel against the hosted project, point a
  test user's email at a real mailbox you control (e.g. a Gmail `+alias`).
- Seeded dev users get synthetic `<phone>@ooruda.test` emails so they satisfy
  the unique-email constraint and skip the forced email-collection gate; they
  continue to log in with the phone test OTP `123456`.
- Both templates load the Ooruda logo from Supabase Storage:
  `https://vkxchopjqakvftcnxwie.supabase.co/storage/v1/object/public/assets/brand/ooruda-black-on-white.svg`.
  Upload `public/images/brand/ooruda-black-on-white.svg` to a **public** bucket
  named `assets` under `brand/` in the Supabase dashboard (Storage → New bucket
  → Public). This is independent of app deployment so the logo works immediately.
