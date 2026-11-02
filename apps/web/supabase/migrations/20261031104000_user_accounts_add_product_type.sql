-- =============================================================
-- Add product_type to public.user_accounts view
--
-- Enables UI components (account selector, sidebar, navigations) to
-- explicitly differentiate between association and villa workspaces.
-- =============================================================

create or replace view
  public.user_accounts (id, name, picture_url, slug, role, product_type)
with
  (security_invoker = true) as
select
  account.id,
  account.name,
  account.picture_url,
  account.slug,
  membership.account_role,
  account.product_type
from
  public.accounts account
  join public.accounts_memberships membership on account.id = membership.account_id
where
  membership.user_id = (select auth.uid ())
  and account.is_personal_account = false
  and account.id in (
    select
      account_id
    from
      public.accounts_memberships
    where
      user_id = (select auth.uid ())
  );

grant select on public.user_accounts to authenticated, service_role;
