
-- 1) Dedupe card_brands per (account_owner_id, lower(name)): keep oldest, re-parent fees.
WITH ranked AS (
  SELECT id, account_owner_id, lower(name) AS lname, created_at,
         ROW_NUMBER() OVER (
           PARTITION BY account_owner_id, lower(name)
           ORDER BY created_at ASC, id ASC
         ) AS rn,
         FIRST_VALUE(id) OVER (
           PARTITION BY account_owner_id, lower(name)
           ORDER BY created_at ASC, id ASC
         ) AS keep_id
  FROM public.card_brands
),
dupes AS (
  SELECT id AS dup_id, keep_id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.card_brand_fees f
SET card_brand_id = d.keep_id
FROM dupes d
WHERE f.card_brand_id = d.dup_id;

-- Now collapse fee duplicates that resulted from the merge (same brand + installment)
WITH fee_ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY card_brand_id, installment_number
           ORDER BY updated_at DESC, created_at DESC, id
         ) AS rn
  FROM public.card_brand_fees
)
DELETE FROM public.card_brand_fees f
USING fee_ranked r
WHERE f.id = r.id AND r.rn > 1;

-- Delete the duplicate brand rows
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY account_owner_id, lower(name)
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.card_brands
)
DELETE FROM public.card_brands b
USING ranked r
WHERE b.id = r.id AND r.rn > 1;

-- 2) Ensure primary Brazilian brands are 'both' so credit/debit are editable per brand
UPDATE public.card_brands
SET type = 'both', updated_at = now()
WHERE lower(name) IN ('visa','mastercard','elo','american express','amex','hipercard','cabal','discover','diners','diners club');

-- 3) Prevent future duplication
CREATE UNIQUE INDEX IF NOT EXISTS card_brands_owner_name_unique
  ON public.card_brands (account_owner_id, lower(name));

-- 4) Backfill missing default payment methods for EVERY account owner (idempotent)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT p.id AS owner_id
    FROM public.profiles p
    WHERE p.account_owner_id = p.id
  LOOP
    PERFORM public.seed_default_payment_methods(r.owner_id);
  END LOOP;
END $$;
