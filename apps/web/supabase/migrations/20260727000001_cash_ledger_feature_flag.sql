-- Add optional cash_ledger_enabled flag to associations.
-- Defaults to true so existing associations are unaffected.
ALTER TABLE public.associations
  ADD COLUMN IF NOT EXISTS cash_ledger_enabled boolean NOT NULL DEFAULT true;
