-- Update expenses mode_of_payment check constraint: rename 'Online Gateway' → 'NetBanking'
alter table public.expenses
  drop constraint if exists expenses_mode_of_payment_check;

alter table public.expenses
  add constraint expenses_mode_of_payment_check
  check (mode_of_payment in (
    'Cash', 'UPI', 'NEFT/RTGS/IMPS', 'Cheque',
    'Demand Draft', 'Credit Card', 'Debit Card', 'NetBanking'
  ));

-- Migrate any existing 'Online Gateway' rows
update public.expenses
set mode_of_payment = 'NetBanking'
where mode_of_payment = 'Online Gateway';
