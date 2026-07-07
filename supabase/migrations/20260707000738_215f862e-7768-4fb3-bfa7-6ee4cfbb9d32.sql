
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_name_key;
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_phone_key;
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_cpf_key;
DROP INDEX IF EXISTS public.clients_name_key;
DROP INDEX IF EXISTS public.clients_phone_key;
DROP INDEX IF EXISTS public.clients_cpf_key;

CREATE UNIQUE INDEX IF NOT EXISTS clients_account_name_unique
  ON public.clients (account_owner_id, lower(name))
  WHERE account_owner_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS clients_account_phone_unique
  ON public.clients (account_owner_id, phone)
  WHERE account_owner_id IS NOT NULL AND phone IS NOT NULL AND phone <> '';

CREATE UNIQUE INDEX IF NOT EXISTS clients_account_cpf_unique
  ON public.clients (account_owner_id, cpf)
  WHERE account_owner_id IS NOT NULL AND cpf IS NOT NULL AND cpf <> '';
