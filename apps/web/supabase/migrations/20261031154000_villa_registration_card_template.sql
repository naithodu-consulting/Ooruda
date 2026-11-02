/*
 * Which guest registration card a villa prints at check-in.
 *
 * The card is not a generic form: Villa 19's is the villa's own letterhead,
 * its own field order and its own house rules, and the next villa onboarded
 * will hand us a different sheet. So the column names a TEMPLATE registered
 * in code (packages/pdf-templates registration-card registry) rather than
 * holding any layout itself. A property whose template key is null, or whose
 * key no template answers to, offers no download at all - there is
 * deliberately no generic fallback, because a card printed on the wrong
 * letterhead is worse than no card.
 *
 * Nullable with no default: a new villa prints nothing until someone has
 * built its template, which is the honest state.
 */

alter table public.villa_properties
  add column if not exists registration_card_template text;

-- Bounded and lowercase-slug shaped: the value is looked up in a code
-- registry, so free text here could only ever be a typo that silently hides
-- the download button.
alter table public.villa_properties
  drop constraint if exists villa_properties_registration_card_template_check;

alter table public.villa_properties
  add constraint villa_properties_registration_card_template_check
  check (
    registration_card_template is null
    or registration_card_template ~ '^[a-z][a-z0-9-]{1,38}[a-z0-9]$'
  );

comment on column public.villa_properties.registration_card_template is
  'Key of the registration-card PDF template to print for this property (see packages/pdf-templates/src/documents/registration-card/registry.ts). Null means this villa has no card.';

/*
 * Villa 19 gets the template built from the sheet the villa already uses at
 * the gate.
 *
 * Matched on booking_code_prefix AND the GSTIN its letterhead prints, not on
 * the display name: ids are generated per environment, and the prefix alone
 * is NOT unique (villa_properties_booking_code_prefix_check only constrains
 * its shape). The villa19 template hardcodes the VILLA19 wordmark and "by
 * Habbaa" while taking the legal name, address and GSTIN from the row, so a
 * second 'V19' property belonging to another operator would print Villa 19's
 * brand over that operator's legal entity. Requiring the GSTIN seeded in
 * 20261029161500 ties the backfill to the entity whose card this is.
 *
 * The notice matters as much as the update: if a future environment stores
 * the prefix or GSTIN differently, this silently matches nothing and the
 * whole feature ships with the button invisible and no trace of why.
 */
do $$
declare
  touched integer;
begin
  update public.villa_properties
  set registration_card_template = 'villa19'
  where booking_code_prefix = 'V19'
    and gstin = '29AAICH1682G1ZD'
    and registration_card_template is null;

  get diagnostics touched = row_count;

  if touched = 0 then
    raise notice 'registration_card_template: no Villa 19 property matched (prefix V19 + GSTIN 29AAICH1682G1ZD) - set it by hand or no card will be offered';
  else
    raise notice 'registration_card_template: set to villa19 on % property(ies)', touched;
  end if;
end $$;

/*
 * Deliberately NOT granted to authenticated: villa_properties is updatable
 * column by column, and which template a property prints is a platform
 * decision (it has to match a template that exists in code), not something a
 * villa admin can type into Settings.
 */
