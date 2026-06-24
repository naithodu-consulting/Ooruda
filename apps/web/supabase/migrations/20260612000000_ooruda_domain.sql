-- =============================================================
-- Ooruda Domain Schema — Phase 1
-- Built on top of MakerKit's existing auth/accounts schema.
-- All domain tables carry association_id and are RLS-protected.
-- =============================================================

-- ─── ASSOCIATIONS ────────────────────────────────────────────
-- Maps 1:1 to MakerKit's team_accounts (accounts table).
-- We extend via a separate domain table to avoid touching MakerKit internals.
create table public.associations (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  address     text,
  gstin       text,
  gst_enabled boolean not null default false,
  mescom_consumer_no text,
  brand_colour text not null default '#3B82F6',
  logo_url    text,
  status      text not null default 'Setup'
                check (status in ('Setup','Active','Suspended')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (account_id)
);

create table public.billing_settings (
  id                          uuid primary key default gen_random_uuid(),
  association_id              uuid not null references public.associations(id) on delete cascade,
  minimum_electricity_charge  numeric(12,2) not null default 0,
  due_day_of_month            smallint not null default 10
                                check (due_day_of_month between 1 and 28),
  reminder_schedule_json      jsonb not null default '{"days_before":[3,1],"days_after":[1,7]}'::jsonb,
  unique (association_id)
);

-- ─── USERS / PROFILES ────────────────────────────────────────
-- MakerKit provides auth.users + public.accounts.
-- We extend with a profiles table for phone number (login identity).
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  mobile_number text unique,               -- phone OTP login identity
  created_at    timestamptz not null default now()
);

-- ─── CHARGE TYPES ────────────────────────────────────────────
create table public.charge_types (
  id                    uuid primary key default gen_random_uuid(),
  association_id        uuid not null references public.associations(id) on delete cascade,
  key                   text not null,     -- e.g. 'maintenance','electricity','penalty','water'
  name                  text not null,
  is_builtin            boolean not null default false,
  calc_method           text not null
                          check (calc_method in ('per_sqft','flat','per_unit','electricity')),
  rate_or_amount        numeric(12,4),     -- null for electricity (computed per period)
  frequency             text not null
                          check (frequency in ('Monthly','Quarterly','HalfYearly','Yearly','OneTime','Custom')),
  custom_interval_months smallint,
  default_payer         text not null default 'Owner'
                          check (default_payer in ('Owner','Tenant')),
  gst_applicable        boolean not null default false,
  is_active             boolean not null default true,
  next_due_period       text,              -- 'YYYY-MM' of next billing run
  created_at            timestamptz not null default now(),
  unique (association_id, key)
);

-- ─── UNITS ───────────────────────────────────────────────────
create table public.units (
  id             uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations(id) on delete cascade,
  unit_no        text not null,
  type           text not null default 'Shop'
                   check (type in ('Shop','Office','Warehouse')),
  floor          smallint,
  area_sqft      numeric(10,2) not null,
  owner_id       uuid references auth.users(id) on delete set null,
  status         text not null default 'Vacant'
                   check (status in ('Occupied','Vacant')),
  created_at     timestamptz not null default now(),
  unique (association_id, unit_no)
);

create table public.unit_charge_overrides (
  id                    uuid primary key default gen_random_uuid(),
  unit_id               uuid not null references public.units(id) on delete cascade,
  charge_type_id        uuid not null references public.charge_types(id) on delete cascade,
  payer_override        text check (payer_override in ('Owner','Tenant')),
  rate_or_amount_override numeric(12,4),
  is_excluded           boolean not null default false,
  created_at            timestamptz not null default now(),
  unique (unit_id, charge_type_id)
);

-- ─── TENANCIES ───────────────────────────────────────────────
create table public.tenancies (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null references public.units(id) on delete cascade,
  tenant_id  uuid not null references auth.users(id) on delete cascade,
  start_date date not null,
  end_date   date,
  status     text not null default 'active'
               check (status in ('active','ended')),
  created_at timestamptz not null default now()
);

-- Enforce one active tenant per unit
create unique index tenancies_one_active_per_unit
  on public.tenancies (unit_id)
  where end_date is null;

-- ─── SUB-METERS ──────────────────────────────────────────────
create table public.sub_meters (
  id           uuid primary key default gen_random_uuid(),
  unit_id      uuid not null references public.units(id) on delete cascade,
  meter_label  text not null,              -- e.g. 'SM-1', 'Common-Lift'
  meter_type   text not null default 'Unit'
                 check (meter_type in ('Unit','CommonArea')),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ─── MESCOM BILLS ────────────────────────────────────────────
create table public.mescom_bills (
  id                     uuid primary key default gen_random_uuid(),
  association_id         uuid not null references public.associations(id) on delete cascade,
  period                 text not null,    -- 'YYYY-MM'
  invoice_amount         numeric(12,2) not null,
  block_consumption_units numeric(12,2) not null,
  invoice_file_url       text,
  effective_rate         numeric(12,6),   -- computed after readings + carry-forward
  uploaded_by            uuid references auth.users(id) on delete set null,
  uploaded_at            timestamptz not null default now(),
  unique (association_id, period)
);

create table public.meter_readings (
  id               uuid primary key default gen_random_uuid(),
  sub_meter_id     uuid not null references public.sub_meters(id) on delete cascade,
  mescom_bill_id   uuid not null references public.mescom_bills(id) on delete cascade,
  period           text not null,
  previous_reading numeric(12,2) not null,
  current_reading  numeric(12,2) not null,
  consumed_units   numeric(12,2) generated always as (current_reading - previous_reading) stored,
  created_at       timestamptz not null default now()
);

-- ─── ELECTRICITY RECONCILIATION ──────────────────────────────
create table public.electricity_reconciliation (
  id                uuid primary key default gen_random_uuid(),
  association_id    uuid not null references public.associations(id) on delete cascade,
  mescom_bill_id    uuid not null references public.mescom_bills(id) on delete cascade,
  period            text not null,
  invoiced_amount   numeric(12,2) not null,
  recovered_amount  numeric(12,2) not null default 0,
  delta             numeric(12,2) generated always as (recovered_amount - invoiced_amount) stored,
  carry_forward_in  numeric(12,2) not null default 0,
  carry_forward_out numeric(12,2),        -- filled after bill generation
  created_at        timestamptz not null default now(),
  unique (association_id, period),
  unique (mescom_bill_id)
);

-- ─── BILLS ───────────────────────────────────────────────────
create table public.bills (
  id             uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations(id) on delete cascade,
  unit_id        uuid not null references public.units(id) on delete cascade,
  period         text not null,            -- 'YYYY-MM'
  bill_no        text not null,
  total_amount   numeric(12,2) not null default 0,
  paid_amount    numeric(12,2) not null default 0,
  status         text not null default 'Unpaid'
                   check (status in ('Unpaid','Partial','Paid','Overdue')),
  due_date       date not null,
  generated_at   timestamptz not null default now(),
  generated_by   uuid references auth.users(id) on delete set null,
  unique (association_id, unit_id, period),
  unique (association_id, bill_no)
);

create table public.bill_line_items (
  id             uuid primary key default gen_random_uuid(),
  bill_id        uuid not null references public.bills(id) on delete cascade,
  charge_type_id uuid references public.charge_types(id) on delete set null,
  description    text not null,
  payer          text not null check (payer in ('Owner','Tenant')),
  gst_applicable boolean not null default false,
  amount         numeric(12,2) not null,
  created_at     timestamptz not null default now()
);

-- ─── PAYMENTS ────────────────────────────────────────────────
create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  association_id      uuid not null references public.associations(id) on delete cascade,
  bill_id             uuid not null references public.bills(id) on delete cascade,
  amount              numeric(12,2) not null,
  mode                text not null
                        check (mode in ('Cash','UPI','Card','NetBanking','Wallet','NEFT','Razorpay')),
  paid_by_role        text not null check (paid_by_role in ('Owner','Tenant')),
  razorpay_payment_id text unique,
  recorded_by         uuid references auth.users(id) on delete set null,
  paid_at             timestamptz not null default now()
);

create table public.receipts (
  id           uuid primary key default gen_random_uuid(),
  payment_id   uuid not null references public.payments(id) on delete cascade,
  receipt_no   text not null,
  pdf_url      text,
  generated_at timestamptz not null default now(),
  unique (payment_id)
);

-- ─── NOTIFICATIONS ───────────────────────────────────────────
create table public.notification_providers_config (
  id             uuid primary key default gen_random_uuid(),
  association_id uuid references public.associations(id) on delete cascade, -- null = platform default
  channel        text not null check (channel in ('SMS','Email','WhatsApp')),
  provider_key   text not null,  -- 'mock','msg91','2factor','resend','ses'
  credentials    jsonb,          -- encrypted at app level before insert
  is_active      boolean not null default false,
  priority       smallint not null default 0
);

create table public.notifications_log (
  id                uuid primary key default gen_random_uuid(),
  association_id    uuid references public.associations(id) on delete cascade,
  type              text not null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  channel           text not null,
  provider_key      text not null,
  status            text not null default 'Pending'
                      check (status in ('Sent','Delivered','Failed','Pending')),
  sent_at           timestamptz not null default now(),
  provider_ref      text
);

-- ─── AUDIT LOG ───────────────────────────────────────────────
create table public.audit_logs (
  id             uuid primary key default gen_random_uuid(),
  association_id uuid references public.associations(id) on delete cascade,
  actor_user_id  uuid references auth.users(id) on delete set null,
  action         text not null,
  entity_type    text not null,
  entity_id      uuid,
  summary        text,
  created_at     timestamptz not null default now()
);

-- ─── INDEXES ────────────────────────────────────────────────
create index bills_association_period    on public.bills (association_id, period);
create index bills_unit_status           on public.bills (unit_id, status);
create index payments_bill               on public.payments (bill_id);
create index meter_readings_sub_meter    on public.meter_readings (sub_meter_id, period);
create index notifications_log_assoc     on public.notifications_log (association_id, sent_at desc);
create index audit_logs_assoc_created    on public.audit_logs (association_id, created_at desc);

-- ─── RLS ─────────────────────────────────────────────────────
alter table public.associations               enable row level security;
alter table public.billing_settings           enable row level security;
alter table public.profiles                   enable row level security;
alter table public.charge_types               enable row level security;
alter table public.units                      enable row level security;
alter table public.unit_charge_overrides      enable row level security;
alter table public.tenancies                  enable row level security;
alter table public.sub_meters                 enable row level security;
alter table public.mescom_bills               enable row level security;
alter table public.meter_readings             enable row level security;
alter table public.electricity_reconciliation enable row level security;
alter table public.bills                      enable row level security;
alter table public.bill_line_items            enable row level security;
alter table public.payments                   enable row level security;
alter table public.receipts                   enable row level security;
alter table public.notification_providers_config enable row level security;
alter table public.notifications_log          enable row level security;
alter table public.audit_logs                 enable row level security;

-- Helper: is the current user a member of a given association (via MakerKit accounts_memberships)?
create or replace function public.is_association_member(p_association_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.associations a
    join public.accounts_memberships am on am.account_id = a.account_id
    where a.id = p_association_id
      and am.user_id = auth.uid()
  );
$$;

-- Helper: get the user's role in an association
create or replace function public.association_role(p_association_id uuid)
returns text
language sql
security definer
stable
as $$
  select am.account_role
  from public.associations a
  join public.accounts_memberships am on am.account_id = a.account_id
  where a.id = p_association_id
    and am.user_id = auth.uid()
  limit 1;
$$;

-- RLS policy pattern: member access (read for all, write for admin/operator roles)
create policy "member_read" on public.associations
  for select using (is_association_member(id));

create policy "member_read" on public.billing_settings
  for select using (is_association_member(association_id));

create policy "member_read" on public.charge_types
  for select using (is_association_member(association_id));

create policy "member_read" on public.units
  for select using (is_association_member(association_id));

create policy "member_read" on public.unit_charge_overrides
  for select using (
    exists (select 1 from public.units u where u.id = unit_id and is_association_member(u.association_id))
  );

create policy "member_read" on public.tenancies
  for select using (
    exists (select 1 from public.units u where u.id = unit_id and is_association_member(u.association_id))
  );

create policy "member_read" on public.sub_meters
  for select using (
    exists (select 1 from public.units u where u.id = unit_id and is_association_member(u.association_id))
  );

create policy "member_read" on public.mescom_bills
  for select using (is_association_member(association_id));

create policy "member_read" on public.meter_readings
  for select using (
    exists (
      select 1 from public.sub_meters sm
      join public.units u on u.id = sm.unit_id
      where sm.id = sub_meter_id and is_association_member(u.association_id)
    )
  );

create policy "member_read" on public.electricity_reconciliation
  for select using (is_association_member(association_id));

create policy "member_read" on public.bills
  for select using (is_association_member(association_id));

create policy "member_read" on public.bill_line_items
  for select using (
    exists (select 1 from public.bills b where b.id = bill_id and is_association_member(b.association_id))
  );

create policy "member_read" on public.payments
  for select using (is_association_member(association_id));

create policy "member_read" on public.receipts
  for select using (
    exists (
      select 1 from public.payments p where p.id = payment_id and is_association_member(p.association_id)
    )
  );

create policy "member_read" on public.audit_logs
  for select using (is_association_member(association_id));

-- Profiles: users can read/update their own profile
create policy "own_profile" on public.profiles
  for all using (id = auth.uid());

-- Notification providers: member read; admin write (full policy wired in W4)
create policy "member_read" on public.notification_providers_config
  for select using (association_id is null or is_association_member(association_id));

create policy "member_read" on public.notifications_log
  for select using (is_association_member(association_id));

-- ─── SEED: BUILT-IN CHARGE TYPES ────────────────────────────
-- Seeded via a trigger when an association row is created.
create or replace function public.seed_builtin_charge_types()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.charge_types
    (association_id, key, name, is_builtin, calc_method, frequency, default_payer, gst_applicable)
  values
    (new.id, 'maintenance', 'Maintenance',  true, 'per_sqft',    'Monthly',  'Owner',  false),
    (new.id, 'electricity', 'Electricity',  true, 'electricity', 'Monthly',  'Tenant', false),
    (new.id, 'penalty',     'Penalty',      true, 'flat',        'OneTime',  'Tenant', false);

  insert into public.billing_settings (association_id)
  values (new.id)
  on conflict (association_id) do nothing;

  return new;
end;
$$;

create trigger trg_seed_charge_types
  after insert on public.associations
  for each row execute function public.seed_builtin_charge_types();

-- ─── SEED: PROFILE ON USER CREATE ───────────────────────────
create or replace function public.create_profile_on_signup()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_create_profile
  after insert on auth.users
  for each row execute function public.create_profile_on_signup();
