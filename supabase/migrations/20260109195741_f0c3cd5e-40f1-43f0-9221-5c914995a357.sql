-- Remove duplicate payment methods keeping only the earliest created one of each name
WITH duplicates AS (
  SELECT id, name, created_at,
         ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at ASC) as rn
  FROM payment_methods
)
DELETE FROM payment_methods
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Remove "Boleto Parcelado" since we'll enhance "Boleto Bancário" to handle installments
DELETE FROM payment_methods WHERE name = 'Boleto Parcelado';

-- Update "Boleto Bancário" to support more installments
UPDATE payment_methods 
SET max_installments = 12 
WHERE name = 'Boleto Bancário';