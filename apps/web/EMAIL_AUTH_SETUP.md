# Email OTP Login — Setup Guide

Email OTP is the **secondary** login channel (phone OTP is primary). It uses
Supabase's native email OTP: `signInWithOtp({ email })` → `verifyOtp({ type: 'email' })`.
A single `auth.users` row carries both phone and email, so either channel signs
the user into the same account.

## Local development — no SMTP needed

Supabase's local stack captures every auth email in **Inbucket** instead of
sending it. After triggering an email OTP from the sign-in screen:

1. Open Inbucket at <http://localhost:54324> (or the Studio Auth logs at
   <http://localhost:54323>).
2. Read the 6-digit code from the "Your sign-in code" email.

The OTP email body is rendered from `supabase/templates/otp.html` (contains
`{{ .Token }}`), wired via `[auth.email.template.magic_link]` in
`supabase/config.toml`. E2E tests read the code from the local mailbox.

## Production (hosted Supabase project) — Gmail SMTP (simplest)

This mirrors the approach used in the financemacha project: point Supabase
Custom SMTP at a Gmail account. No domain verification or DNS records required.

> Volume caps: free Gmail ≈ 500 emails/day, Google Workspace ≈ 2,000/day. Fine
> for early/low volume. To scale later, swap the SMTP credentials for Resend /
> SES / Postmark in the same dashboard screen — **no code change** is needed,
> since we use native OTP either way.

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

### Step 3 — Enable Email OTP

Dashboard → **Authentication → Providers → Email**:

- Enable the **Email** provider.
- Turn **Email OTP** ON; set OTP length **6**, expiry ~**600s**.
- Set **"Allow new users to sign up"** = **OFF** (email is secondary-login only;
  the app also passes `shouldCreateUser: false`).
- Set **Secure email change** (double-confirm) = **OFF**. The add-email and
  change-email flows verify a single OTP sent to the **new** address. Legacy
  phone-only users have no old email to confirm, and a user changing email may
  have lost access to the old one — a double-confirm would dead-end both.

### Step 4 — OTP email template

Dashboard → **Authentication → Email Templates → Magic Link** (this is the
template GoTrue uses for `signInWithOtp({ email })`). Ensure the body includes
`{{ .Token }}` so the user receives a **code**, not a magic link. You can paste
the contents of `supabase/templates/otp.html`.

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
