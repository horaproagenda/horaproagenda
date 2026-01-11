-- Remove all duplicate payment methods, keeping only the oldest one of each name (by created_at)
DELETE FROM payment_methods p1
WHERE EXISTS (
  SELECT 1 FROM payment_methods p2 
  WHERE p2.name = p1.name 
  AND p2.created_at < p1.created_at
);

-- Add unique constraint to prevent future duplicates
ALTER TABLE payment_methods ADD CONSTRAINT payment_methods_name_unique UNIQUE (name);