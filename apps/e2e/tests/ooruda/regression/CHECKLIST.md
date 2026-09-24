# Ooruda regression checklist

Run on 2026-09-24 against a local production build (`next build` + `next start`)
backed by local Supabase. Automated cases live in this folder:

```bash
# from apps/e2e, with the app running (dev on :3000 or a prod build on :3002)
OORUDA_BASE_URL=http://localhost:3002 pnpm exec playwright test -c playwright.ooruda.config.ts
```

**Result: 126 / 126 automated cases pass (2m 20s).** Legend: ✅ automated pass ·
👁 verified manually in the browser · ⚠️ finding (see bottom).

Test accounts (sandbox-residency-test): admin 9911000006 · billing operator
9911000008 · owner 9911000020 (units 410, A2) · tenant 9911000005 · super admin
9742914274.

## 1. Authentication

| # | Case | Result |
|---|---|---|
| 1.1 | Sign-in page renders, no console errors, fits 360/768/1280 | ✅ |
| 1.2 | Invalid mobile number rejected client-side (no code sent) | ✅ |
| 1.3 | Valid number → code step; correct code signs in (all 5 roles) | ✅ (setup) |
| 1.4 | Wrong code keeps the user on the code step | ✅ |
| 1.5 | Super admin lands on /admin; members land in their association | ✅ |
| 1.6 | Signed-out user opening a workspace page is sent to sign-in | ✅ |
| 1.7 | Country-code picker opens below its field | ✅ |
| 1.8 | Sign-in rate limit: page loads don't count; 21st submission in a minute shows a countdown and disables the button | 👁 fixed (F1) |

## 2. Page health — every page × role (loads, no crash, no console errors, no 5xx)

| Page | Admin | Operator | Owner | Tenant |
|---|---|---|---|---|
| Dashboard | ✅ | ✅ | ✅ | ✅ |
| Units, Unit detail | ✅ | ✅ | ✅ blocked | ✅ blocked |
| Billing, Drafts, Bills by unit, Unit billing | ✅ | ✅ | ✅ blocked | ✅ blocked |
| Electricity | ✅ | ✅ | ✅ blocked | ✅ blocked |
| Payments | ✅ | ✅ | ✅ | ✅ |
| Cash ledger | ✅ | ✅ | ✅ blocked | ✅ blocked |
| Expenses, Expense detail | ✅ | ✅ | ✅ blocked | ✅ blocked |
| AMC, AMC contract detail | ✅ | ✅ blocked | ✅ blocked | ✅ blocked |
| Reports | ✅ | ✅ | ✅ blocked | ✅ blocked |
| Statement | ✅ blocked | ✅ blocked | ✅ | ✅ |
| Notifications, Members, Profile settings | ✅ | ✅ | ✅ | ✅ |
| Audit log, Association settings | ✅ | ✅ blocked | ✅ blocked | ✅ blocked |
| Super admin: Accounts, Activity, Bill dispatch, Channels | ✅ | | | |
| Super admin can open an association workspace | ✅ | | | |
| Public: Privacy, Terms, Refund, robots.txt, sitemap.xml | ✅ | | | |

"blocked" = the role is redirected away and never shown the page.

## 3. Responsive (360 / 768 / 1280 px, every page above)

| # | Case | Result |
|---|---|---|
| 3.1 | No horizontal page scroll on any page, any role, any width | ✅ (after fix) |
| 3.2 | Wide tables scroll inside their card, not the page | ✅ |
| 3.3 | No text clipped by a hidden-overflow container at 375 px | ✅ |
| 3.4 | Tap targets ≥ 24 px at 375 px | ✅ |
| 3.5 | Mobile nav: menu opens and navigates | ✅ |
| 3.6 | Page title aligned with breadcrumb on mobile/tablet | 👁 fixed |
| 3.7 | Mobile top-bar avatar shows initials (not "?") | 👁 fixed |
| 3.8 | Audit log table fits its card at 1280 | ✅ |

## 4. PDFs & downloads

| # | Case | Result |
|---|---|---|
| 4.1 | Bill PDF: valid PDF, clean filename, repeat download served from cache (188 ms → 120 ms) | ✅ |
| 4.2 | Receipt PDF (121 ms) | ✅ |
| 4.3 | Expenses export PDF | ✅ |
| 4.4 | Bills ZIP (228 ms), receipts ZIP — valid ZIPs | ✅ |
| 4.5 | Reports "Download PDF" produces a .pdf | ✅ |
| 4.6 | Owner: own bill ✓, other unit's bill → 404, statement for each owned unit ✓ | ✅ |
| 4.7 | Owner cannot bulk-export; tenant without tenancy can't read owner's bill | ✅ |
| 4.8 | Signed-out PDF request refused | ✅ |
| 4.9 | Filenames have no `/` or `%2F` | ✅ |
| 4.10 | Association logo appears on newly rendered PDFs | 👁 (stale cache fixed by migration 20260924000002) |
| 4.11 | Advance voucher / cash-ledger receipts | Not run — no local data |

## 5. Flows

| # | Case | Result |
|---|---|---|
| 5.1 | Expense: create → find by search → delete | ✅ |
| 5.2 | Date picker: year dropdown (2000…) jumps the calendar | ✅ |
| 5.3 | Bill tree: expand bill → Download Bill; panel aligned with bill name | ✅ |
| 5.4 | Units status filters | ✅ |
| 5.5 | Owner dashboard shows own units | ✅ |
| 5.6 | Profile settings: only Login & Security; old email/MFA/linked cards hidden | ✅ |
| 5.7 | Record payment / void payment / generate bills / Razorpay | Not automated (mutates billing data) — manual check recommended |
| 5.8 | Invite member, change phone/email (OTP) | Not automated — manual check recommended |

## Findings

- **Fixed — AMC contract page overflowed 135 px on phones** (action buttons didn't wrap).
- **Fixed — hydration error (React #418) on Profile settings**: MakerKit's settings container rendered different HTML on server vs client when the account data was already cached. Now renders the loading state for the first client pass.
- **Fixed — mobile page titles indented** for a sidebar icon that is hidden below desktop width (all workspace pages).
- **Fixed — mobile top-bar avatar showed "?"** for users without a name.
- **Fixed — Reports Directory KPI tiles** didn't collapse on phones.
- **Fixed — F1: sign-in rate limit was too tight and silent.** `proxy.ts` allowed 5 requests/min per IP to everything under `/auth`, including page loads, so one mistyped code or users sharing a carrier/office IP got locked out, and the button silently did nothing. Now only sign-in submissions (POST) count, the limit is 20/min, and the form shows "Too many attempts. Please try again in N seconds" with the button disabled until the window resets. Unexpected send errors now show an error instead of being swallowed.
- **Note — existing `tests/ooruda/phone-auth.po.ts`** treats 9911000006 as super admin; it is only the sandbox admin. The MakerKit specs in `playwright.config.ts` assume email/password sign-in, which Ooruda doesn't use.
- **Note — missing `data-test` attributes** on Reports export, top bar, bill tree and bill panel controls (CLAUDE.md asks for them on interactive elements); tests use role/text selectors there.
