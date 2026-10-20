-- Advance application vouchers cache their rendered PDF in Storage and record
-- the path in advance_application_receipts.pdf_url, written server-side with
-- the service-role client. 20260727000003 revoked ALL privileges from
-- service_role on this table, so that write has always failed silently and
-- every voucher download re-rendered the PDF from scratch.
--
-- Grant only what the cache needs: UPDATE of the pdf_url column (plus SELECT,
-- which PostgREST needs to locate the row being updated). No other column can
-- be changed, and authenticated/anon grants are untouched.
grant select on public.advance_application_receipts to service_role;
grant update (pdf_url) on public.advance_application_receipts to service_role;
