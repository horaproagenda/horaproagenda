-- 1) Reaponta lançamentos das categorias duplicadas para a categoria mais antiga (a "canônica")
WITH ranked AS (
  SELECT id, name, type,
         FIRST_VALUE(id) OVER (PARTITION BY name, type ORDER BY created_at, id) AS keeper_id
  FROM public.financial_categories
)
UPDATE public.financial_entries fe
SET category_id = r.keeper_id
FROM ranked r
WHERE fe.category_id = r.id
  AND r.id <> r.keeper_id;

-- 2) Exclui as categorias duplicadas (mantém a mais antiga de cada nome+tipo)
WITH ranked AS (
  SELECT id, name, type,
         ROW_NUMBER() OVER (PARTITION BY name, type ORDER BY created_at, id) AS rn
  FROM public.financial_categories
)
DELETE FROM public.financial_categories fc
USING ranked r
WHERE fc.id = r.id AND r.rn > 1;

-- 3) Garante unicidade futura (case-insensitive por nome + tipo)
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_categories_name_type
  ON public.financial_categories (lower(trim(name)), type);

-- 4) Remove o lançamento incorreto de devolução em Contas a Pagar
DELETE FROM public.financial_entries
WHERE id = '981ce1f2-a20d-427e-ab84-9fe75f2908f4'
  AND type = 'payable'
  AND description ILIKE 'Devolução:%';