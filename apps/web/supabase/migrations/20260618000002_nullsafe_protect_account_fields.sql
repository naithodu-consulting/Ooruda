-- =============================================================
-- NULL-safe account field protection
--
-- `kit.protect_account_fields` guards immutable account columns on UPDATE by
-- comparing NEW vs OLD with `<>`. In a phone-OTP app personal accounts have a
-- NULL `email`, and `NULL <> NULL` evaluates to NULL (three-valued logic), so
-- the guard does not behave as written for those rows. Switch to
-- `is distinct from`, which treats two NULLs as equal and a NULL/value pair as
-- different — the correct semantics for an "unchanged?" check — so routine
-- updates (e.g. setting `picture_url` from the profile-picture uploader) on
-- email-less accounts are evaluated reliably.
-- =============================================================

create or replace function kit.protect_account_fields()
returns trigger as $$
begin
    if current_user in ('authenticated', 'anon') then
        if new.id is distinct from old.id
            or new.is_personal_account is distinct from old.is_personal_account
            or new.primary_owner_user_id is distinct from old.primary_owner_user_id
            or new.email is distinct from old.email then
            raise exception 'You do not have permission to update this field';
        end if;
    end if;

    return new;
end
$$ language plpgsql
set search_path = '';
