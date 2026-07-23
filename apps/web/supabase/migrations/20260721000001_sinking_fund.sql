-- Sinking Fund: ad-hoc charge type billed on association's schedule
-- (monthly / quarterly / annual — admin decides per collection event).
-- Mirrors the other_charges pattern: staged in pending_sinking_fund_charges,
-- then bulk-generated into bills with bill_type = 'sinking_fund'.

-- 1. Update seed trigger so new associations get a sinking_fund charge type.
create or replace function seed_builtin_charge_types()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  insert into public.charge_types
    (association_id, key, name, is_builtin, calc_method, frequency, default_payer, gst_applicable)
  values
    (new.id, 'maintenance',   'Maintenance',   true, 'per_sqft',    'Monthly', 'Owner',  false),
    (new.id, 'electricity',   'Electricity',   true, 'electricity', 'Monthly', 'Owner',  false),
    (new.id, 'water',         'Water',         true, 'flat',        'Monthly', 'Owner',  false),
    (new.id, 'other_charges', 'Other Charges', true, 'flat',        'OneTime', 'Tenant', false),
    (new.id, 'sinking_fund',  'Sinking Fund',  true, 'flat',        'OneTime', 'Owner',  false)
  on conflict do nothing;
  return new;
end;
$$;

-- 2. Backfill sinking_fund charge type for every existing association.
insert into public.charge_types
  (association_id, key, name, is_builtin, calc_method, frequency, default_payer, gst_applicable, is_active)
select
  a.id,
  'sinking_fund',
  'Sinking Fund',
  true,
  'flat',
  'OneTime',
  'Owner',
  false,
  true
from public.associations a
where not exists (
  select 1 from public.charge_types ct
  where ct.association_id = a.id and ct.key = 'sinking_fund'
);

-- 3. Pending sinking fund charges table (mirrors pending_other_charges).
create table if not exists public.pending_sinking_fund_charges (
  id               uuid primary key default gen_random_uuid(),
  association_id   uuid not null references public.associations(id) on delete cascade,
  unit_id          uuid references public.units(id) on delete cascade,  -- null = all units
  period           varchar(7) not null,   -- YYYY-MM (billing period to attach to)
  label            text not null,         -- e.g. "Q1 Apr–Jun 2026" or "Annual 2026-27"
  amount           numeric(12,2) not null check (amount > 0),
  split_mode       varchar(10) check (split_mode in ('flat', 'per_sqft')),
  due_date         date,
  billed           boolean not null default false,
  created_at       timestamptz not null default now()
);

alter table public.pending_sinking_fund_charges enable row level security;

create policy "assoc members can read pending_sinking_fund_charges"
  on public.pending_sinking_fund_charges for select
  using (
    exists (
      select 1 from public.accounts_memberships am
      where am.account_id = pending_sinking_fund_charges.association_id
        and am.user_id = auth.uid()
    )
  );

create policy "billing operators can insert pending_sinking_fund_charges"
  on public.pending_sinking_fund_charges for insert
  with check (
    exists (
      select 1 from public.accounts_memberships am
      where am.account_id = pending_sinking_fund_charges.association_id
        and am.user_id = auth.uid()
        and am.account_role in ('assoc_admin', 'billing_operator')
    )
  );

create policy "billing operators can update pending_sinking_fund_charges"
  on public.pending_sinking_fund_charges for update
  using (
    exists (
      select 1 from public.accounts_memberships am
      where am.account_id = pending_sinking_fund_charges.association_id
        and am.user_id = auth.uid()
        and am.account_role in ('assoc_admin', 'billing_operator')
    )
  );

create policy "billing operators can delete pending_sinking_fund_charges"
  on public.pending_sinking_fund_charges for delete
  using (
    exists (
      select 1 from public.accounts_memberships am
      where am.account_id = pending_sinking_fund_charges.association_id
        and am.user_id = auth.uid()
        and am.account_role in ('assoc_admin', 'billing_operator')
    )
  );
