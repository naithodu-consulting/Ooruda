-- Add optional per-charge due date and a billed flag to pending_other_charges.
-- due_date: when set, overrides the association's default other_charges_due_day for that charge.
-- billed: set to true after the charge has been included in a generated bill.
alter table pending_other_charges
  add column if not exists due_date date,
  add column if not exists billed boolean not null default false;
