/*
 * The guest booking confirmation carries the legal footer every transactional
 * email from a registered company needs: who sent it, from where, and under
 * which registration. villa_properties already held legal_name and gstin for
 * the GST invoice; the rest of that block had nowhere to live, so the email
 * simply left it out.
 *
 * All nullable. A villa that has not filled these in renders the email exactly
 * as it does today - each block is skipped rather than printed empty - so this
 * migration changes nothing on its own.
 */

alter table public.villa_properties
  add column if not exists legal_address text,
  add column if not exists cin text,
  add column if not exists support_email text;

-- Bounded rather than free text: these are printed into an email footer, and
-- a pasted paragraph would break the layout for every guest.
alter table public.villa_properties
  drop constraint if exists villa_properties_legal_address_check;

alter table public.villa_properties
  add constraint villa_properties_legal_address_check
  check (
    legal_address is null
    or length(btrim(legal_address)) between 5 and 300
  );

-- Format of a Corporate Identity Number: L/U, 5-digit industry code, 2-letter
-- state, 4-digit year, 3-letter ownership code, 6-digit registration number.
alter table public.villa_properties
  drop constraint if exists villa_properties_cin_check;

alter table public.villa_properties
  add constraint villa_properties_cin_check
  check (cin is null or cin ~ '^[LUlu][0-9]{5}[A-Za-z]{2}[0-9]{4}[A-Za-z]{3}[0-9]{6}$');

alter table public.villa_properties
  drop constraint if exists villa_properties_support_email_check;

alter table public.villa_properties
  add constraint villa_properties_support_email_check
  check (
    support_email is null
    or (
      support_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
      and length(support_email) <= 254
    )
  );

comment on column public.villa_properties.legal_address is
  'Registered address of the operating company, for the guest email footer and invoices.';
comment on column public.villa_properties.cin is
  'Corporate Identity Number of the operating company, for the guest email footer.';
comment on column public.villa_properties.support_email is
  'Guest-facing address for cancellations and questions. Falls back to the sender address when unset.';

/*
 * villa_properties is granted column by column rather than table-wide: a villa
 * admin may edit the handful of fields the Settings screen owns and nothing
 * else (never site_project_ref, retention_days or is_test). A new column is
 * therefore read-only until it is named here, and the RLS policy alone is not
 * enough - the update is refused with no rows changed.
 */
grant update (legal_address, cin, support_email)
  on public.villa_properties to authenticated;
