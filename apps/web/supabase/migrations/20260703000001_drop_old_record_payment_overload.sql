-- =============================================================
-- Drop the old 5-arg overload of record_payment.
-- The 8-arg version (with default p_razorpay_payment_id,
-- p_razorpay_order_id, p_payment_batch_id) was added in
-- 20260702000004_razorpay_gateway.sql via CREATE OR REPLACE but
-- with a different signature — PostgreSQL treats that as a NEW
-- overload rather than a replacement. PostgREST returns HTTP 300
-- (ambiguous) when both overloads are present and the caller
-- passes only the original 5 arguments. Dropping the stale
-- 5-arg overload resolves the ambiguity; the 8-arg version
-- handles manual payments with all three Razorpay params
-- defaulting to NULL.
-- =============================================================

drop function if exists public.record_payment(
  uuid,    -- p_bill_id
  uuid,    -- p_association_id
  numeric, -- p_amount
  text,    -- p_mode
  text     -- p_paid_by_role
);
