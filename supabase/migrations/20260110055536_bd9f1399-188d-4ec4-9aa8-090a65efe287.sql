-- Remover métodos de pagamento duplicados, mantendo apenas um de cada
-- Primeiro identificar os IDs a manter (o mais antigo de cada nome)
WITH duplicates AS (
  SELECT id, name,
    ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at ASC) as rn
  FROM payment_methods
)
DELETE FROM payment_methods
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);