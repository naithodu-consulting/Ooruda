-- Rename the built-in 'penalty' charge type to 'other_charges'.
-- This is idempotent — if already renamed, the update matches 0 rows.
update charge_types
set key  = 'other_charges',
    name = 'Other Charges'
where key = 'penalty';

-- Update the seed trigger so new associations also get 'other_charges'.
create or replace function seed_builtin_charge_types()
returns trigger language plpgsql as $$
begin
  insert into charge_types
    (association_id, key,             name,             is_builtin, calc_method,   frequency,  default_payer, gst_applicable)
  values
    (new.id, 'maintenance',   'Maintenance',   true, 'per_sqft',    'Monthly',  'Owner',  false),
    (new.id, 'electricity',   'Electricity',   true, 'electricity', 'Monthly',  'Owner',  false),
    (new.id, 'water',         'Water',         true, 'flat',        'Monthly',  'Owner',  false),
    (new.id, 'other_charges', 'Other Charges', true, 'flat',        'OneTime',  'Tenant', false);
  return new;
end;
$$;

-- Staging table for ad-hoc other charges added before bill generation.
-- unit_id = null means "all units" (use split_mode to determine per-unit amount).
create table if not exists pending_other_charges (
  id               uuid        primary key default gen_random_uuid(),
  association_id   uuid        not null references associations(id) on delete cascade,
  unit_id          uuid        references units(id) on delete cascade,
  period           text        not null,
  label            text        not null,
  amount           numeric(10, 2) not null check (amount > 0),
  -- 'flat'     → every unit gets `amount`
  -- 'per_sqft' → every unit gets `amount * unit.area_sqft`
  -- null when unit_id is not null (single-unit charge)
  split_mode       text        check (split_mode in ('flat', 'per_sqft')),
  created_at       timestamptz not null default now()
);

-- RLS: only members of the association can see/modify pending charges.
alter table pending_other_charges enable row level security;

create policy "assoc members can read pending other charges"
  on pending_other_charges for select
  using (
    exists (
      select 1 from associations a
      join accounts_memberships am on am.account_id = a.account_id
      where a.id = pending_other_charges.association_id
        and am.user_id = auth.uid()
    )
  );

create policy "billing operators can insert pending other charges"
  on pending_other_charges for insert
  with check (
    public.association_role(association_id) in ('assoc_admin', 'billing_operator')
    and (
      unit_id is null
      or exists (
        select 1 from units u
        where u.id = unit_id
          and u.association_id = pending_other_charges.association_id
      )
    )
  );

create policy "billing operators can delete pending other charges"
  on pending_other_charges for delete
  using (
    public.association_role(association_id) in ('assoc_admin', 'billing_operator')
  );
