-- Invalidate all cached receipt PDFs so they regenerate with the
-- reference_no column added to the receipt template.
update public.receipts set pdf_url = null where pdf_url is not null;
