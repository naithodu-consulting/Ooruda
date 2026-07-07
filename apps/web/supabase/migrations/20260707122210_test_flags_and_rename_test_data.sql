-- Add is_test flag to associations and profiles
ALTER TABLE public.associations
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- Rename test associations and mark them
UPDATE public.accounts
  SET name = 'Sandbox Residency', slug = 'sandbox-residency'
  WHERE id = '7e7e54d5-febd-45e6-9263-16416a8c771c';

UPDATE public.associations
  SET is_test = true
  WHERE id = 'fc1de46d-d024-46a2-b4ff-f3bda2bd764f';

UPDATE public.accounts
  SET name = 'Demo Towers', slug = 'demo-towers'
  WHERE id = '198c46df-9d39-4122-8dff-a45f8007ad34';

UPDATE public.associations
  SET is_test = true
  WHERE id = 'badd6e3e-bcf0-4358-9eda-19e10b8f0845';

-- Mark and rename test users
UPDATE public.profiles SET is_test = true, full_name = 'Arjun T. Admin'   WHERE mobile_number = '+919911000001';
UPDATE public.profiles SET is_test = true, full_name = 'Priya T. Billing' WHERE mobile_number = '+919911000002';
UPDATE public.profiles SET is_test = true, full_name = 'Karan T. Owner'   WHERE mobile_number = '+919911000003';
UPDATE public.profiles SET is_test = true, full_name = 'Dev T. Multi'     WHERE mobile_number = '+919911000004';
UPDATE public.profiles SET is_test = true, full_name = 'Raj T. Tenant'    WHERE mobile_number = '+919911000005';
UPDATE public.profiles SET is_test = true, full_name = 'Rohan T. Admin'   WHERE mobile_number = '+919911000006';
UPDATE public.profiles SET is_test = true, full_name = 'Nikhil T. Owner'  WHERE mobile_number = '+919911000007';
UPDATE public.profiles SET is_test = true, full_name = 'Sam T. Billing'   WHERE mobile_number = '+919911000008';
UPDATE public.profiles SET is_test = true, full_name = 'Sneha T. Tenant'  WHERE mobile_number = '+919911000009';
UPDATE public.profiles SET is_test = true, full_name = 'Rahul T. Tenant'  WHERE mobile_number = '+919911000010';
UPDATE public.profiles SET is_test = true, full_name = 'Ravi T. Owner'    WHERE mobile_number = '+919911000020';
