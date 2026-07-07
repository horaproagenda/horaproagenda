-- Escopar unicidade de categorias financeiras por conta (tenant) em vez de global.
DROP INDEX IF EXISTS public.uq_financial_categories_name_type;

CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_categories_owner_name_type
  ON public.financial_categories (account_owner_id, lower(trim(name)), type)
  WHERE account_owner_id IS NOT NULL;