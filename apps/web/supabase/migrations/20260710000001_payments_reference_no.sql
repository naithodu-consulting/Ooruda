-- Add free-text reference number to payments for bookkeeping.
-- Examples: UPI transaction ID, cheque number, NEFT UTR, cash voucher number.
-- Nullable — not required for Cash; auto-populated separately for Razorpay.
alter table public.payments
  add column if not exists reference_no text;
