-- Drop the existing check constraint and recreate with 'gel' included
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_product_type_check;

ALTER TABLE public.products ADD CONSTRAINT products_product_type_check 
CHECK (product_type IN ('solid', 'liquid', 'cream', 'powder', 'gel', 'other'));