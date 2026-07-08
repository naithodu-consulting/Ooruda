-- Configurable authorised signatory name, shown on electricity bill PDFs.
ALTER TABLE associations
  ADD COLUMN IF NOT EXISTS authorised_signatory TEXT;
