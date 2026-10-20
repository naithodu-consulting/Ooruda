-- Fix amc_contracts check constraint to allow end_date = start_date (same-day contracts)
alter table public.amc_contracts drop constraint if exists amc_contracts_check;

alter table public.amc_contracts
  add constraint amc_contracts_end_date_check check (end_date >= start_date);
