-- ── Advance Payment via Razorpay (owner/tenant self-service) ─────────────────
-- Adds razorpay tracking columns to cash_ledger, a unique idempotency index,
-- and the record_advance_payment function that is called from the verify route.

-- 1. New columns on cash_ledger
ALTER TABLE public.cash_ledger
  ADD COLUMN IF NOT EXISTS razorpay_order_id   text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text,
  ADD COLUMN IF NOT EXISTS paid_by_role        text,
  ADD COLUMN IF NOT EXISTS tenancy_id          uuid REFERENCES public.tenancies(id);

-- 2. Idempotency index — prevents double-recording if both /verify and webhook fire
-- Plain CREATE INDEX (not CONCURRENTLY) is safe here: razorpay_payment_id is a brand-new
-- column with no existing rows, so the lock duration is negligible. CONCURRENTLY would
-- require running outside a transaction and is unnecessary for a new column.
CREATE UNIQUE INDEX IF NOT EXISTS cash_ledger_razorpay_payment_id_idx
  ON public.cash_ledger (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

-- 3. record_advance_payment — idempotent, inserts advance credit, auto-applies
CREATE OR REPLACE FUNCTION public.record_advance_payment(
  p_association_id      uuid,
  p_unit_id             uuid,
  p_bill_type           text,
  p_amount              numeric,
  p_paid_by_name        text,
  p_paid_by_role        text,
  p_tenancy_id          uuid,
  p_razorpay_order_id   text,
  p_razorpay_payment_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_ledger_id   uuid;
BEGIN
  -- Idempotency: return early if this Razorpay payment was already recorded
  SELECT id INTO v_existing_id
  FROM public.cash_ledger
  WHERE razorpay_payment_id = p_razorpay_payment_id;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_existing_id, 'already_recorded', true);
  END IF;

  -- Insert advance credit
  INSERT INTO public.cash_ledger (
    association_id,
    unit_id,
    entry_type,
    bill_type,
    amount,
    direction,
    entry_date,
    paid_by_name,
    paid_by_role,
    tenancy_id,
    razorpay_order_id,
    razorpay_payment_id
  ) VALUES (
    p_association_id,
    p_unit_id,
    'advance_payment',
    p_bill_type,
    p_amount,
    'credit',
    current_date,
    p_paid_by_name,
    p_paid_by_role,
    p_tenancy_id,
    p_razorpay_order_id,
    p_razorpay_payment_id
  )
  RETURNING id INTO v_ledger_id;

  -- Auto-apply: credit any outstanding bills of this type for the unit
  PERFORM public._apply_advance_internal(p_association_id, p_unit_id, p_bill_type);

  RETURN jsonb_build_object('id', v_ledger_id, 'already_recorded', false);
END;
$$;

-- Only the service_role (backend verify/webhook routes) may call this.
REVOKE ALL ON FUNCTION public.record_advance_payment(uuid, uuid, text, numeric, text, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_advance_payment(uuid, uuid, text, numeric, text, text, uuid, text, text) TO service_role;
