/*
 * Normalize existing `profiles.mobile_number` values to canonical E.164 form
 * for India (`+91XXXXXXXXXX`).
 *
 * Historically these were stored inconsistently — some with `+91`, some as bare
 * digits, and some malformed (e.g. `+9911000008`, `+8826262459`). This app is
 * India-only / phone-OTP, so the national number is the last 10 digits of
 * whatever was stored. We rebuild every value as `+91` + those 10 digits.
 *
 * Only rows that yield a valid Indian mobile number (10 digits starting 6-9)
 * are touched; anything that can't be salvaged is left untouched for manual
 * review rather than silently corrupted.
 *
 * NOTE: `auth.users.phone` is managed by GoTrue (stored as bare digits and used
 * for OTP sign-in) and is intentionally NOT modified here to avoid breaking
 * authentication. Display is normalized at render time via `formatPhoneNumber`.
 */
update public.profiles
set mobile_number =
  '+91' || right(regexp_replace(mobile_number, '\D', '', 'g'), 10)
where mobile_number is not null
  and length(regexp_replace(mobile_number, '\D', '', 'g')) >= 10
  and right(regexp_replace(mobile_number, '\D', '', 'g'), 10) ~ '^[6-9][0-9]{9}$'
  and mobile_number is distinct from
    '+91' || right(regexp_replace(mobile_number, '\D', '', 'g'), 10);
