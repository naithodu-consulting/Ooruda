-- Sync accounts.name from profiles.full_name for all test users.
-- The previous migration updated profiles.full_name but accounts.name
-- is a separate column and was not updated.
UPDATE public.accounts a
SET name = p.full_name
FROM public.profiles p
WHERE a.id = p.id
  AND p.is_test = true;
