-- Add contact and bank details fields to associations table.
-- These are shown on bill/receipt PDFs (header contact strip + footer bank block).

alter table public.associations
  add column if not exists email        text,
  add column if not exists phone        text,
  add column if not exists bank_account_name   text,
  add column if not exists bank_account_number text,
  add column if not exists bank_name    text,
  add column if not exists bank_ifsc    text,
  add column if not exists bank_branch  text;

-- Invalidate all cached PDFs so they regenerate with the new template design.
update public.bills    set pdf_url = null, pdf_generated_at = null where pdf_url is not null;
update public.receipts set pdf_url = null                             where pdf_url is not null;
