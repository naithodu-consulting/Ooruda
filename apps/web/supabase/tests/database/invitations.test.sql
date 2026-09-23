BEGIN;

select no_plan();

-- ----------------------------------------------------------------------------
-- Setup: create our OWN users + team account so this test does not depend on
-- the seeded makerkit users (which e2e runs can mutate/rename, e.g. owner@ ->
-- owner1@). 'inv_owner' owns the account, 'inv_member' is a plain member,
-- 'inv_manager' is a member holding a custom role with invites.manage, and
-- 'inv_foreigner' is not a member of the account.
-- ----------------------------------------------------------------------------

select tests.create_supabase_user('inv_owner', 'inv_owner@test.com');
select tests.create_supabase_user('inv_member', 'inv_member@test.com');
select tests.create_supabase_user('inv_manager', 'inv_manager@test.com');
select tests.create_supabase_user('inv_foreigner', 'inv_foreigner@test.com');

-- create the team account as service_role (the function is granted to
-- service_role); do NOT authenticate first or the new-account trigger would
-- create a duplicate owner membership.
set local role service_role;

select public.create_team_account(
    'Invite Test',
    tests.get_supabase_uid('inv_owner'),
    'invite-test'
);

set local role postgres;

-- a custom role that holds invites.manage, to prove that holding the permission
-- still does not allow a direct INSERT (only the service_role RPC can create)
insert into public.roles (name, hierarchy_level)
values ('inv-custom', 50);

insert into public.role_permissions (role, permission)
values ('inv-custom', 'invites.manage');

insert into public.accounts_memberships (account_id, user_id, account_role)
values
    (makerkit.get_account_id_by_slug('invite-test'), tests.get_supabase_uid('inv_member'), 'member'),
    (makerkit.get_account_id_by_slug('invite-test'), tests.get_supabase_uid('inv_manager'), 'inv-custom');

-- ----------------------------------------------------------------------------
-- Direct INSERTs into invitations are blocked by RLS for ALL authenticated
-- users (there is no INSERT policy). Invitations are only created via the
-- service_role RPC add_invitations_to_account.
-- ----------------------------------------------------------------------------

-- account owner: blocked
select makerkit.authenticate_as('inv_owner');

select throws_ok(
    $$ insert into public.invitations (email, invited_by, account_id, role, invite_token) values ('invite1@test.com', auth.uid(), makerkit.get_account_id_by_slug('invite-test'), 'member', gen_random_uuid()) $$,
    'new row violates row-level security policy for table "invitations"',
    'the account owner cannot directly insert invitations'
);

-- plain member: blocked
select makerkit.authenticate_as('inv_member');

select throws_ok(
    $$ insert into public.invitations (email, invited_by, account_id, role, invite_token) values ('invite2@test.com', auth.uid(), makerkit.get_account_id_by_slug('invite-test'), 'member', gen_random_uuid()) $$,
    'new row violates row-level security policy for table "invitations"',
    'a plain member cannot directly insert invitations'
);

-- member holding invites.manage: STILL blocked (permission does not bypass RLS)
select makerkit.authenticate_as('inv_manager');

select throws_ok(
    $$ insert into public.invitations (email, invited_by, account_id, role, invite_token) values ('invite3@test.com', auth.uid(), makerkit.get_account_id_by_slug('invite-test'), 'member', gen_random_uuid()) $$,
    'new row violates row-level security policy for table "invitations"',
    'a member with invites.manage still cannot directly insert invitations'
);

-- foreigner (no membership): blocked
select makerkit.authenticate_as('inv_foreigner');

select throws_ok(
    $$ insert into public.invitations (email, invited_by, account_id, role, invite_token) values ('invite4@test.com', auth.uid(), makerkit.get_account_id_by_slug('invite-test'), 'member', gen_random_uuid()) $$,
    'new row violates row-level security policy for table "invitations"',
    'a non-member cannot directly insert invitations'
);

-- no invitations should have been created by any of the blocked inserts.
-- NOTE: select id (not *) - authenticated may not read the invite_token column.
select makerkit.authenticate_as('inv_owner');

select is_empty(
    $$ select id from public.invitations where account_id = makerkit.get_account_id_by_slug('invite-test') $$,
    'no invitations should exist when direct inserts are blocked'
);

-- the privileged creation RPC must not be callable by authenticated users.
-- NOTE: we assert the privilege rather than invoking the function. Calling the
-- function on a role without EXECUTE triggers a segfault inside a Postgres
-- extension hook (supautils/pgaudit) on the bundled Postgres version.
select ok(
    not has_function_privilege(
        'authenticated',
        'public.add_invitations_to_account(text, public.invitation[], uuid)',
        'execute'
    ),
    'authenticated users cannot call add_invitations_to_account'
);

-- ----------------------------------------------------------------------------
-- invite_token is a credential (the accept route exchanges it for a session).
-- The `authenticated` role must NOT be able to read the invite_token column via
-- the data API, even though it can read invitation rows it has access to (RLS).
-- service_role (used by the admin client on the accept route) retains access.
-- This is defense-in-depth on top of the signed-link check on /join/accept.
-- ----------------------------------------------------------------------------

select ok(
    not has_column_privilege('authenticated', 'public.invitations', 'invite_token', 'select'),
    'authenticated cannot SELECT the invite_token column'
);

select ok(
    has_column_privilege('authenticated', 'public.invitations', 'email', 'select'),
    'authenticated can still SELECT non-secret invitation columns (email)'
);

select ok(
    has_column_privilege('authenticated', 'public.invitations', 'role', 'select'),
    'authenticated can still SELECT non-secret invitation columns (role)'
);

select ok(
    has_column_privilege('authenticated', 'public.invitations', 'expires_at', 'select'),
    'authenticated can still SELECT non-secret invitation columns (expires_at)'
);

select ok(
    has_column_privilege('service_role', 'public.invitations', 'invite_token', 'select'),
    'service_role can SELECT the invite_token column (used by the accept route)'
);

-- the column-level revoke must not have stripped the row-mutation grants
select ok(
    has_table_privilege('authenticated', 'public.invitations', 'insert'),
    'authenticated retains INSERT on invitations (gated by RLS)'
);

select ok(
    has_table_privilege('authenticated', 'public.invitations', 'update'),
    'authenticated retains UPDATE on invitations (gated by RLS)'
);

select ok(
    has_table_privilege('authenticated', 'public.invitations', 'delete'),
    'authenticated retains DELETE on invitations (gated by RLS)'
);

-- functional check: seed an invitation directly (as postgres, bypassing RLS),
-- then confirm an authenticated account member can read its non-secret columns
-- but NOT the invite_token credential.
set local role postgres;

insert into public.invitations (email, invited_by, account_id, role, invite_token)
values (
    'col-invitee@test.com',
    tests.get_supabase_uid('inv_owner'),
    makerkit.get_account_id_by_slug('invite-test'),
    'member',
    gen_random_uuid()
);

select makerkit.authenticate_as('inv_owner');

select isnt_empty(
    $$ select id, email, role from public.invitations where email = 'col-invitee@test.com' $$,
    'an account member can read non-secret invitation columns'
);

select throws_ok(
    $$ select invite_token from public.invitations where email = 'col-invitee@test.com' $$,
    '42501',
    null,
    'an account member cannot read the invite_token column'
);

select * from finish();

rollback;
