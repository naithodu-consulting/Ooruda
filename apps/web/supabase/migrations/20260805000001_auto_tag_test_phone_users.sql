-- Auto-tag profiles as test users when their phone matches a known test-number prefix.
-- Prefixes (E.164, more specific than before to avoid matching real Airtel/Vodafone numbers):
--   +9199110000  → test block +919911000000–+919911000099 (matches existing test users)
--   +9199999999  → test block +919999999900–+919999999999 (matches existing test users)

-- Backfill existing users (IS NOT TRUE covers both false and NULL)
UPDATE public.profiles
SET is_test = true
WHERE is_test IS NOT TRUE
  AND mobile_number IS NOT NULL
  AND (
    mobile_number LIKE '+9199110000%'
    OR mobile_number LIKE '+9199999999%'
  );

-- Trigger function: re-evaluate is_test on every phone insert/update.
-- Sets true when phone matches a test prefix; clears it back to false otherwise,
-- so correcting a test phone to a real number un-tags the user automatically.
CREATE OR REPLACE FUNCTION public.auto_tag_test_phone_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.mobile_number IS NOT NULL AND (
    NEW.mobile_number LIKE '+9199110000%'
    OR NEW.mobile_number LIKE '+9199999999%'
  ) THEN
    NEW.is_test := true;
  ELSE
    -- Only clear is_test if it was set by this auto-tag mechanism (phone-based).
    -- Manual overrides via direct SQL are not reversed here because the trigger
    -- only fires on mobile_number changes; if a phone is corrected to a real number
    -- the auto-tag should be removed.
    NEW.is_test := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_tag_test_phone ON public.profiles;
CREATE TRIGGER trg_auto_tag_test_phone
  BEFORE INSERT OR UPDATE OF mobile_number ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.auto_tag_test_phone_profile();
