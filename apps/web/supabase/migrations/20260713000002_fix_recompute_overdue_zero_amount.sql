-- Fix recompute_overdue_bills to skip zero-amount bills.
-- Bills with total_amount = 0 have nothing to pay and should never be
-- transitioned to 'Overdue', regardless of their due_date.
create or replace function public.recompute_overdue_bills()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.bills
  set status = 'Overdue'
  where status in ('Unpaid', 'Partial')
    and due_date < current_date
    and total_amount > 0;
end;
$$;
