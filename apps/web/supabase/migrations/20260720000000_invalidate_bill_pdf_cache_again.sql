-- Re-invalidate all cached bill/receipt PDFs. Several rounds of template
-- tweaks (logo size, title size, header rule, electricity bill layout) have
-- landed since the last cache invalidation — any bill/receipt downloaded in
-- between is still serving the old cached PDF from storage and won't show
-- the latest template until regenerated.
update public.bills    set pdf_url = null, pdf_generated_at = null where pdf_url is not null;
update public.receipts set pdf_url = null                             where pdf_url is not null;
