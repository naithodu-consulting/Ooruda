-- Migration 20260724000002 introduced a 6-arg record_due_payment that
-- generates receipt_no internally, but only revoked permissions on the
-- old 7-arg version instead of dropping it. Both overloads coexisted,
-- causing Postgres ambiguity errors when the caller omits p_receipt_no.
-- This migration drops the old 7-arg version to resolve the conflict.

drop function if exists public.record_due_payment(
  uuid, uuid, text, numeric, text, text, text
);
