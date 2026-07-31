ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_owner_id_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_account_owner_id_fkey
  FOREIGN KEY (account_owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;