#!/usr/bin/env bash
#
# PropOps Dev Seed - Villa 19 test users & test account data
#
# Seeds:
#   919900000001 (Pradeep, villa_admin)
#   919900000002 (Jeff, villa_manager)
# Both users have test OTP 123456 in local config.toml.
#
set -euo pipefail

cd "$(dirname "$0")/../.."   # -> apps/web

URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')
KEY=$(grep '^SUPABASE_SECRET_KEY=' .env.local | cut -d= -f2- | tr -d '"')

if [[ -z "$URL" || -z "$KEY" ]]; then
  echo "ERROR: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY missing from .env.local" >&2
  exit 1
fi

# This script writes to the LOCAL database via psql, so it must never be run
# while .env.local points at a remote project (it would create auth users there
# but seed the tables locally).
case "$URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *)
    echo "ERROR: refusing to seed a non-local Supabase ($URL). Point .env.local at local." >&2
    exit 1
    ;;
esac

user_id_by_phone() {
  psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -t -A -c "select id from auth.users where phone = '$1';" 2>/dev/null || true
}

echo "1. Provisioning Villa test users via GoTrue Admin API..."
VILLA_USERS=(
  "88bba581-d98c-4d65-8b58-a943be2709e2|919900000001|Pradeep|919900000001@oorudavilla.com"
  "5dc93217-5c3c-4111-baaa-d6cebcc6c5e6|919900000002|Jeff|919900000002@oorudavilla.com"
)

for entry in "${VILLA_USERS[@]}"; do
  IFS='|' read -r uid phone name email <<< "$entry"
  existing_id="$(user_id_by_phone "$phone")"
  if [[ -n "$existing_id" ]]; then
    curl -sS --fail-with-body -X PUT "$URL/auth/v1/admin/users/$existing_id" \
      -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
      -d "{\"email\":\"$email\",\"email_confirm\":true,\"user_metadata\":{\"full_name\":\"$name\"}}" >/dev/null
    echo "  updated $phone ($name)"
  else
    curl -sS --fail-with-body -X POST "$URL/auth/v1/admin/users" \
      -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
      -d "{\"id\":\"$uid\",\"phone\":\"$phone\",\"phone_confirm\":true,\"email\":\"$email\",\"email_confirm\":true,\"user_metadata\":{\"full_name\":\"$name\"}}" >/dev/null
    echo "  created $phone ($name)"
  fi
done

echo "2. Populating Villa 19 account & properties in local DB..."
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

-- Account
INSERT INTO public.accounts (id, primary_owner_user_id, name, slug, email, is_personal_account, product_type, public_data)
VALUES ('8bf674d4-1f32-4f98-a5f3-5ed839dc8eba', '88bba581-d98c-4d65-8b58-a943be2709e2', 'Villa 19', 'villa-19-test', NULL, FALSE, 'villa', '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
    primary_owner_user_id = EXCLUDED.primary_owner_user_id,
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    product_type = EXCLUDED.product_type;

-- Memberships
INSERT INTO public.accounts_memberships (account_id, user_id, account_role)
VALUES
    ('8bf674d4-1f32-4f98-a5f3-5ed839dc8eba', '88bba581-d98c-4d65-8b58-a943be2709e2', 'villa_admin'),
    ('8bf674d4-1f32-4f98-a5f3-5ed839dc8eba', '5dc93217-5c3c-4111-baaa-d6cebcc6c5e6', 'villa_manager')
ON CONFLICT (user_id, account_id) DO NOTHING;

-- Profiles consent
UPDATE public.profiles
SET consent_accepted_at = now()
WHERE id IN ('88bba581-d98c-4d65-8b58-a943be2709e2', '5dc93217-5c3c-4111-baaa-d6cebcc6c5e6')
  AND consent_accepted_at IS NULL;

-- Property
INSERT INTO public.villa_properties (id, account_id, name, site_project_ref, site_property_id, booking_code_prefix, site_credentials_ref, status, is_test, retention_days, ota_buffer_nights)
VALUES ('a0ceeede-21eb-40c8-bbe9-3644f5ca429b', '8bf674d4-1f32-4f98-a5f3-5ed839dc8eba', 'Villa 19', 'hlmqcdzazbrztfovixjk', 'a1b2c3d4-0000-0000-0000-000000000001', 'V19', '33a8e45e-c936-40d2-8213-d507902fda88', 'active', FALSE, 30, 0)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    booking_code_prefix = EXCLUDED.booking_code_prefix,
    status = EXCLUDED.status;

-- Settings
INSERT INTO public.villa_account_settings (account_id, managers_can_cancel, pre_arrival_email, thank_you_email, guest_emails_checked_at)
VALUES ('8bf674d4-1f32-4f98-a5f3-5ed839dc8eba', FALSE, TRUE, TRUE, '2026-10-19 12:29:29.401+00')
ON CONFLICT (account_id) DO UPDATE SET
    managers_can_cancel = EXCLUDED.managers_can_cancel,
    pre_arrival_email = EXCLUDED.pre_arrival_email,
    thank_you_email = EXCLUDED.thank_you_email;

-- Discount codes
INSERT INTO public.villa_discount_codes (id, account_id, property_id, code, discount_type, discount_value, max_discount, valid_from, valid_to, min_nights, min_booking_value, max_uses, max_uses_per_guest, blackouts, channels, stackable, status, created_by)
VALUES
    ('9dc59f5f-ae10-4b9c-a885-9db897c5f4d6', '8bf674d4-1f32-4f98-a5f3-5ed839dc8eba', 'a0ceeede-21eb-40c8-bbe9-3644f5ca429b', 'VILLA19', 'percent', '15.00', '2500.00', '2026-10-05', '2026-10-31', 1, '10000.00', 100, 1, '[]'::jsonb, ARRAY['online'], FALSE, 'active', '88bba581-d98c-4d65-8b58-a943be2709e2'),
    ('b4acd63b-8f46-48ba-b940-ada78ea50dd5', '8bf674d4-1f32-4f98-a5f3-5ed839dc8eba', 'a0ceeede-21eb-40c8-bbe9-3644f5ca429b', 'PRIVATE20', 'percent', '20.00', '5000.00', '2026-10-13', '2026-11-01', 1, '0.00', NULL, 1, '[]'::jsonb, ARRAY['online'], FALSE, 'active', '88bba581-d98c-4d65-8b58-a943be2709e2')
ON CONFLICT (id) DO UPDATE SET
    code = EXCLUDED.code,
    discount_type = EXCLUDED.discount_type,
    discount_value = EXCLUDED.discount_value,
    status = EXCLUDED.status;

-- Guest
INSERT INTO public.villa_guests (id, account_id, full_name, phone, created_by)
VALUES ('140c4719-24ed-4c3e-90fe-75dd250dfc7c', '8bf674d4-1f32-4f98-a5f3-5ed839dc8eba', 'Jeffron', '+918050922997', '88bba581-d98c-4d65-8b58-a943be2709e2')
ON CONFLICT (id) DO NOTHING;

-- Sync state
INSERT INTO public.villa_mirror_sync_state (account_id, property_id, last_synced_at)
VALUES ('8bf674d4-1f32-4f98-a5f3-5ed839dc8eba', 'a0ceeede-21eb-40c8-bbe9-3644f5ca429b', '2026-10-19 12:29:27.715+00')
ON CONFLICT (property_id) DO NOTHING;

COMMIT;
SQL

echo "Done. Villa test users and data seeded into 'villa-19-test'."
