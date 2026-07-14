-- Invalidate cached electricity bill PDFs so they regenerate with the
-- renamed description ("Electricity Charges for <period>") and total row
-- ("Total Electricity Charges"), replacing the old "Sub-meter" labels.
update public.bills
set pdf_url = null
where bill_type = 'electricity' and pdf_url is not null;
