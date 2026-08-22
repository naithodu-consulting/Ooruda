-- ─────────────────────────────────────────────────────────────────────────────
-- v2.2: Expense Tracker + AMC Reminder
-- Tables: association_feature_flags, expense_categories, vendors, expenses,
--         amc_contracts, amc_renewal_history, amc_reminder_settings
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Feature Flags ──────────────────────────────────────────────────────────

create table if not exists public.association_feature_flags (
  id              uuid        not null default extensions.uuid_generate_v4(),
  association_id  uuid        not null references public.associations(id) on delete cascade,
  feature         text        not null,
  enabled         boolean     not null default false,
  enabled_at      timestamptz,
  enabled_by      uuid        references auth.users(id) on delete set null,
  primary key (id),
  unique (association_id, feature),
  check (feature in ('expense_tracker', 'amc_reminder'))
);

create index if not exists idx_assoc_feature_flags_assoc
  on public.association_feature_flags (association_id);

alter table public.association_feature_flags enable row level security;

revoke all on public.association_feature_flags from authenticated, service_role;
grant select, insert, update, delete on public.association_feature_flags to authenticated, service_role;

-- Super admin can do anything; association members can read their own flags
create policy "feature_flags_super_admin_all" on public.association_feature_flags
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "feature_flags_member_read" on public.association_feature_flags
  for select to authenticated
  using (public.association_role(association_id) is not null);

-- ── 2. Expense Categories ─────────────────────────────────────────────────────

create table if not exists public.expense_categories (
  id              uuid        not null default extensions.uuid_generate_v4(),
  association_id  uuid        references public.associations(id) on delete cascade,
  name            text        not null,
  created_at      timestamptz not null default now(),
  primary key (id),
  -- null association_id = system default (visible to all associations)
  unique (association_id, name)
);

create index if not exists idx_expense_categories_assoc
  on public.expense_categories (association_id);

alter table public.expense_categories enable row level security;

revoke all on public.expense_categories from authenticated, service_role;
grant select, insert, update, delete on public.expense_categories to authenticated, service_role;

-- System defaults (association_id IS NULL) are readable by all authenticated users
create policy "expense_categories_read" on public.expense_categories
  for select to authenticated
  using (
    association_id is null
    or public.association_role(association_id) in ('assoc_admin', 'billing_operator')
  );

create policy "expense_categories_write" on public.expense_categories
  for all to authenticated
  using (public.association_role(association_id) in ('assoc_admin', 'billing_operator'))
  with check (public.association_role(association_id) in ('assoc_admin', 'billing_operator'));

-- ── 3. Vendors (Payee Master) ─────────────────────────────────────────────────

create table if not exists public.vendors (
  id              uuid        not null default extensions.uuid_generate_v4(),
  association_id  uuid        not null references public.associations(id) on delete cascade,
  name            text        not null,
  contact_person  text,
  phone           text,
  email           text,
  gst_number      text,
  bank_details    text,
  created_at      timestamptz not null default now(),
  primary key (id)
);

create index if not exists idx_vendors_assoc
  on public.vendors (association_id);

alter table public.vendors enable row level security;

revoke all on public.vendors from authenticated, service_role;
grant select, insert, update, delete on public.vendors to authenticated, service_role;

create policy "vendors_read_write" on public.vendors
  for all to authenticated
  using (public.association_role(association_id) in ('assoc_admin', 'billing_operator'))
  with check (public.association_role(association_id) in ('assoc_admin', 'billing_operator'));

-- ── 4. Expenses ───────────────────────────────────────────────────────────────

create table if not exists public.expenses (
  id                  uuid        not null default extensions.uuid_generate_v4(),
  association_id      uuid        not null references public.associations(id) on delete cascade,
  title               text        not null,
  category_id         uuid        references public.expense_categories(id) on delete set null,
  sub_category        text,
  amount              numeric(12, 2) not null check (amount > 0),
  gst_amount          numeric(12, 2) check (gst_amount >= 0),
  payor               text        not null default 'Association',
  payee_id            uuid        references public.vendors(id) on delete set null,
  payee_name          text        not null,
  mode_of_payment     text        not null,
  reference_number    text,
  invoice_number      text,
  date_of_payment     date        not null,
  notes               text,
  recurring           boolean     not null default false,
  recurring_frequency text,
  linked_amc_id       uuid,  -- FK added after amc_contracts is created below
  attachment_url      text,
  created_by          uuid        not null references auth.users(id) on delete restrict,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  primary key (id),
  check (mode_of_payment in (
    'Cash', 'UPI', 'NEFT/RTGS/IMPS', 'Cheque',
    'Demand Draft', 'Credit Card', 'Debit Card', 'NetBanking'
  ))
);

create index if not exists idx_expenses_assoc
  on public.expenses (association_id);
create index if not exists idx_expenses_assoc_date
  on public.expenses (association_id, date_of_payment desc);
create index if not exists idx_expenses_category
  on public.expenses (category_id);
create index if not exists idx_expenses_vendor
  on public.expenses (payee_id);
create index if not exists idx_expenses_deleted
  on public.expenses (association_id) where deleted_at is null;

alter table public.expenses enable row level security;

revoke all on public.expenses from authenticated, service_role;
grant select, insert, update, delete on public.expenses to authenticated, service_role;

create policy "expenses_read_write" on public.expenses
  for all to authenticated
  using (public.association_role(association_id) in ('assoc_admin', 'billing_operator'))
  with check (public.association_role(association_id) in ('assoc_admin', 'billing_operator'));

-- ── 5. AMC Contracts ─────────────────────────────────────────────────────────

create table if not exists public.amc_contracts (
  id                    uuid        not null default extensions.uuid_generate_v4(),
  association_id        uuid        not null references public.associations(id) on delete cascade,
  name                  text        not null,
  vendor_name           text        not null,
  vendor_contact_person text,
  vendor_phone          text,
  vendor_email          text,
  category              text        not null,
  start_date            date        not null,
  end_date              date        not null,
  contract_value        numeric(12, 2) not null check (contract_value >= 0),
  payment_frequency     text        not null default 'Annual',
  next_payment_due      date,
  auto_renewal          boolean     not null default false,
  notice_period_days    int         check (notice_period_days >= 0),
  priority              text        not null default 'medium',
  coverage_scope        text,
  sla_terms             text,
  notes                 text,
  contract_document_url text,
  terminated_at         timestamptz,
  terminated_reason     text,
  created_by            uuid        not null references auth.users(id) on delete restrict,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  primary key (id),
  check (end_date > start_date),
  check (priority in ('critical', 'high', 'medium', 'low')),
  check (payment_frequency in ('Annual', 'Bi-annual', 'Quarterly', 'Monthly')),
  check (category in (
    'Elevator/Lift', 'Generator/DG Set', 'Fire Safety & Suppression',
    'CCTV & Security Systems', 'Water Treatment/STP', 'Pest Control',
    'Garden & Landscaping', 'Electrical Systems', 'Plumbing',
    'Intercom & Access Control', 'IT/Networking', 'Housekeeping Contract',
    'Security Agency', 'Solar/Renewable', 'Gym Equipment', 'Swimming Pool',
    'Parking Management', 'Air Conditioning (Central)', 'Pumps & Motors', 'Other'
  ))
);

-- Computed status as a generated column expression
-- We use a function so it stays in sync automatically
create or replace function public.amc_contract_status(
  p_end_date    date,
  p_terminated_at timestamptz
) returns text
language sql
immutable
parallel safe
as $$
  select case
    when p_terminated_at is not null then 'terminated'
    when p_end_date < current_date then 'expired'
    when p_end_date - current_date <= 7 then 'critical'
    when p_end_date - current_date <= 30 then 'urgent'
    when p_end_date - current_date <= 90 then 'due_soon'
    else 'active'
  end;
$$;

create index if not exists idx_amc_contracts_assoc
  on public.amc_contracts (association_id);
create index if not exists idx_amc_contracts_end_date
  on public.amc_contracts (association_id, end_date);
create index if not exists idx_amc_contracts_active
  on public.amc_contracts (association_id, end_date)
  where terminated_at is null;

alter table public.amc_contracts enable row level security;

revoke all on public.amc_contracts from authenticated, service_role;
grant select, insert, update, delete on public.amc_contracts to authenticated, service_role;

create policy "amc_contracts_read_write" on public.amc_contracts
  for all to authenticated
  using (public.association_role(association_id) = 'assoc_admin')
  with check (public.association_role(association_id) = 'assoc_admin');

-- ── 6. AMC Renewal History ────────────────────────────────────────────────────

create table if not exists public.amc_renewal_history (
  id                uuid        not null default extensions.uuid_generate_v4(),
  amc_contract_id   uuid        not null references public.amc_contracts(id) on delete cascade,
  renewed_at        date        not null,
  new_end_date      date        not null,
  contract_value    numeric(12, 2) not null check (contract_value >= 0),
  renewed_by        uuid        not null references auth.users(id) on delete restrict,
  linked_expense_id uuid        references public.expenses(id) on delete set null,
  notes             text,
  created_at        timestamptz not null default now(),
  primary key (id)
);

create index if not exists idx_amc_renewal_contract
  on public.amc_renewal_history (amc_contract_id);

alter table public.amc_renewal_history enable row level security;

revoke all on public.amc_renewal_history from authenticated, service_role;
grant select, insert, update, delete on public.amc_renewal_history to authenticated, service_role;

-- Access via parent contract's association_id (assoc_admin only — mirrors amc_contracts policy)
create policy "amc_renewal_history_read_write" on public.amc_renewal_history
  for all to authenticated
  using (
    exists (
      select 1 from public.amc_contracts c
      where c.id = amc_contract_id
        and public.association_role(c.association_id) = 'assoc_admin'
    )
  )
  with check (
    exists (
      select 1 from public.amc_contracts c
      where c.id = amc_contract_id
        and public.association_role(c.association_id) = 'assoc_admin'
    )
  );

-- ── 7. AMC Reminder Settings ──────────────────────────────────────────────────

create table if not exists public.amc_reminder_settings (
  id                  uuid        not null default extensions.uuid_generate_v4(),
  association_id      uuid        not null references public.associations(id) on delete cascade,
  remind_days_before  int         not null default 30 check (remind_days_before > 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (id),
  unique (association_id)
);

alter table public.amc_reminder_settings enable row level security;

revoke all on public.amc_reminder_settings from authenticated, service_role;
grant select, insert, update, delete on public.amc_reminder_settings to authenticated, service_role;

create policy "amc_reminder_settings_read_write" on public.amc_reminder_settings
  for all to authenticated
  using (public.association_role(association_id) = 'assoc_admin')
  with check (public.association_role(association_id) = 'assoc_admin');

-- ── 8. Now add the FK from expenses → amc_contracts ──────────────────────────

alter table public.expenses
  add constraint expenses_linked_amc_fk
  foreign key (linked_amc_id) references public.amc_contracts(id) on delete set null;

create index if not exists idx_expenses_linked_amc
  on public.expenses (linked_amc_id) where linked_amc_id is not null;

-- ── 9. Seed default expense categories (system-wide, association_id IS NULL) ──

insert into public.expense_categories (name, association_id) values
  ('Maintenance & Repairs',  null),
  ('Utilities',              null),
  ('Security',               null),
  ('Housekeeping',           null),
  ('Landscaping',            null),
  ('AMC Payments',           null),
  ('Administrative',         null),
  ('Legal & Professional',   null),
  ('Insurance',              null),
  ('Events & Community',     null),
  ('Capital Expenditure',    null),
  ('Salaries & Wages',       null),
  ('Taxes & Govt Fees',      null),
  ('Miscellaneous',          null)
on conflict do nothing;

-- ── 10. AMC daily reminder function (called by pg_cron or Supabase scheduler) ─
-- Creates in-app notifications for AMC contracts expiring in exactly
-- remind_days_before days for each association with amc_reminder enabled.
-- CRITICAL: strictly association-scoped — no cross-association data leaks.
-- NOTE: Email delivery is handled separately via Supabase Edge Function that
-- reads un-dismissed notifications of type 'warning'. This function only
-- writes the in-app notification row; the edge function reads it and sends email.

create or replace function public.send_amc_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assoc     record;
  v_contract  record;
  v_days      int;
  v_slug      text;
begin
  -- Iterate only over associations with amc_reminder enabled.
  -- SECURITY: each iteration is strictly scoped to one association_id.
  for v_assoc in
    select a.id as association_id, a.account_id
    from public.associations a
    join public.association_feature_flags f
      on f.association_id = a.id
     and f.feature = 'amc_reminder'
     and f.enabled = true
  loop
    -- Get this association's reminder threshold (default 30 days)
    select coalesce(
      (select remind_days_before
       from public.amc_reminder_settings
       where association_id = v_assoc.association_id),
      30
    ) into v_days;

    -- Resolve account slug once per association for the deep link
    select slug into v_slug
    from public.accounts
    where id = v_assoc.account_id;

    -- Find contracts expiring in exactly v_days days for THIS association only
    for v_contract in
      select id, name, end_date
      from public.amc_contracts
      where association_id = v_assoc.association_id  -- scoped: never leaks
        and terminated_at is null
        and (end_date - current_date) = v_days
    loop
      -- One in-app notification per contract per association (not per user).
      -- type='warning' so the notification bell highlights it appropriately.
      insert into public.notifications (
        account_id,
        type,
        body,
        link
      ) values (
        v_assoc.account_id,
        'warning'::public.notification_type,
        format(
          'AMC renewal due in %s days: %s (expires %s)',
          v_days,
          v_contract.name,
          to_char(v_contract.end_date, 'DD Mon YYYY')
        ),
        format('/home/%s/amc/%s', v_slug, v_contract.id)
      );
    end loop;
  end loop;
end;
$$;

comment on function public.send_amc_reminders() is
  'Daily cron: creates in-app warning notifications for expiring AMC contracts. '
  'Strictly association-scoped — never leaks data across association boundaries. '
  'Schedule via Supabase cron: select cron.schedule(''amc-reminders'', ''0 7 * * *'', $$select public.send_amc_reminders()$$);';
