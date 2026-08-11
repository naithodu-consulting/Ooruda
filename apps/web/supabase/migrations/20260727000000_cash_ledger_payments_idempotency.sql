-- Prevent double-crediting a cash-ledger due via duplicate Razorpay payments.
-- The app-layer idempotency pre-check in verify-due/route.ts has a TOCTOU race
-- when concurrent requests pass the pre-check simultaneously. This index is the
-- authoritative guard: any second INSERT with the same razorpay_payment_id
-- raises a 23505 which the route catches and maps to alreadyRecorded:true.
create unique index if not exists cash_ledger_payments_razorpay_uniq
  on public.cash_ledger_payments(razorpay_payment_id)
  where razorpay_payment_id is not null;
