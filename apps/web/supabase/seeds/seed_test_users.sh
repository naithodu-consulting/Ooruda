#!/usr/bin/env bash
#
# PropOps Dev Seed — 5 test users with different roles.
#
# WHY A SCRIPT (not pure SQL): Supabase Auth (GoTrue) owns auth.users +
# auth.identities + internal fields. Hand-inserting into auth.users via SQL
# produces half-provisioned users that GoTrue can't find by phone → sign-in
# fails with "Database error saving new user" or spawns duplicate "ghost"
# users. We create users through the GoTrue Admin API (correct + reliable),
# then assign association roles via SQL.
#
# USAGE (from apps/web):
#   bash supabase/seeds/seed_test_users.sh
#
# REQUIRES in apps/web/.env.local:
#   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_ACCESS_TOKEN
# REQUIRES: the association (team account) already exists; set TARGET_SLUG.
#
# After running, add these as Supabase dashboard "Test Phone Numbers and OTPs"
# WITHOUT the '+' prefix, OTP 123456 (919911000006 = platform super admin):
#   919911000001=123456,919911000002=123456,919911000003=123456,919911000004=123456,919911000005=123456,919911000006=123456
set -euo pipefail

cd "$(dirname "$0")/../.."   # -> apps/web

TARGET_SLUG="${TARGET_SLUG:-abish-association}"

URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')
KEY=$(grep '^SUPABASE_SECRET_KEY=' .env.local | cut -d= -f2- | tr -d '"')
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '"')

if [[ -z "$URL" || -z "$KEY" ]]; then
  echo "ERROR: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY missing from .env.local" >&2
  exit 1
fi

# phone -> "Full Name|role" (bare phone, no '+', matching Supabase storage)
USERS=(
  "919911000001|Dev Admin|assoc_admin"
  "919911000002|Dev Billing Operator|billing_operator"
  "919911000003|Dev Owner A|prop_owner"
  "919911000004|Dev Owner B|prop_owner"
  "919911000005|Dev Tenant|tenant"
)

# Look up a user id by phone via the DB (reliable). NOTE: the GoTrue Admin API
# GET /admin/users?phone=... does NOT filter by phone — the param is ignored and
# it returns the first page of ALL users. Using it for existence/lookup silently
# matches the wrong user. Always resolve by phone through the database instead.
user_id_by_phone() {
  supabase db query --linked "select id from auth.users where phone = '$1';" 2>/dev/null \
    | python3 -c "import sys,json
try:
    r = json.load(sys.stdin).get('rows', [])
    print(r[0]['id'] if r else '')
except Exception:
    print('')"
}

# Each test user also gets a UNIQUE synthetic email (<phone>@ooruda.test) with
# email_confirm=true. WHY <phone> (not role): multiple test users can share a
# role, so a role-based address would collide on profiles.email's unique
# constraint — the phone is unique, so this never collides and needs no bypass.
# Having an email also means these users skip the mandatory-email gate and can
# exercise the email-OTP channel (read the code from Inbucket locally).
echo "Creating test users via GoTrue Admin API..."
for entry in "${USERS[@]}"; do
  IFS='|' read -r phone name role <<< "$entry"
  email="${phone}@ooruda.test"
  uid="$(user_id_by_phone "$phone")"
  if [[ -n "$uid" ]]; then
    # Backfill the synthetic email on pre-existing users (idempotent).
    curl -s -X PUT "$URL/auth/v1/admin/users/$uid" \
      -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
      -d "{\"email\":\"$email\",\"email_confirm\":true}" \
      | python3 -c "import sys,json;d=json.load(sys.stdin);print('  updated', '$phone', d.get('email') or ('ERR '+str(d.get('msg'))))"
  else
    curl -s -X POST "$URL/auth/v1/admin/users" \
      -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
      -d "{\"phone\":\"$phone\",\"phone_confirm\":true,\"email\":\"$email\",\"email_confirm\":true,\"user_metadata\":{\"full_name\":\"$name\"}}" \
      | python3 -c "import sys,json;d=json.load(sys.stdin);print('  created', '$phone', d.get('id') or ('ERR '+str(d.get('msg'))))"
  fi
done

# Super Admin is PLATFORM-level (MakerKit /admin), not a per-association role.
# Provision a dedicated user with app_metadata.role='super-admin' and NO
# association membership. is_super_admin() reads this claim; the MFA gate is
# relaxed for PropOps in migration 20260617000001_super_admin_no_mfa.sql.
SUPER_ADMIN_PHONE="919911000006"
echo "Provisioning super admin ($SUPER_ADMIN_PHONE)..."
sa_id=$(user_id_by_phone "$SUPER_ADMIN_PHONE")
SUPER_ADMIN_EMAIL="${SUPER_ADMIN_PHONE}@ooruda.test"
if [[ -z "$sa_id" ]]; then
  curl -s -X POST "$URL/auth/v1/admin/users" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d "{\"phone\":\"$SUPER_ADMIN_PHONE\",\"phone_confirm\":true,\"email\":\"$SUPER_ADMIN_EMAIL\",\"email_confirm\":true,\"user_metadata\":{\"full_name\":\"Dev Super Admin\"},\"app_metadata\":{\"role\":\"super-admin\"}}" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print('  created super admin', d.get('id') or ('ERR '+str(d.get('msg'))))"
else
  # ensure the role claim and synthetic email are set even if the user pre-existed
  curl -s -X PUT "$URL/auth/v1/admin/users/$sa_id" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d "{\"email\":\"$SUPER_ADMIN_EMAIL\",\"email_confirm\":true,\"app_metadata\":{\"role\":\"super-admin\"}}" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print('  updated super admin', d.get('id'))"
fi

echo "Assigning roles in '$TARGET_SLUG'..."
supabase db query --linked "
with target as (
  select id from public.accounts
  where slug = '${TARGET_SLUG}' and is_personal_account = false
),
roles(phone, role) as (values
  ('919911000001','assoc_admin'),
  ('919911000002','billing_operator'),
  ('919911000003','prop_owner'),
  ('919911000004','prop_owner'),
  ('919911000005','tenant'))
insert into public.accounts_memberships (user_id, account_id, account_role)
select u.id, (select id from target), r.role
from roles r join auth.users u on u.phone = r.phone
where (select id from target) is not null
-- DO NOTHING (not DO UPDATE): the kit.prevent_memberships_update trigger
-- raises on any UPDATE that doesn't change account_role, so re-seeding
-- with an unchanged role would error. Roles are set on first insert.
on conflict (user_id, account_id) do nothing;
" >/dev/null

echo "Done. Test users seeded into '$TARGET_SLUG'."
