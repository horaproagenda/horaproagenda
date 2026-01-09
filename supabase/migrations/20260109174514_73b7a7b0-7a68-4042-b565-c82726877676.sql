-- Add estimated_appointments field to service_products for liquid/gel/cream tracking
-- This allows tracking "this bottle lasts ~30 appointments" instead of exact quantity

ALTER TABLE public.service_products 
ADD COLUMN IF NOT EXISTS estimated_appointments integer DEFAULT NULL;

-- Add container_amount field to track the amount in the current container being used
-- Example: 1L bottle from a 5L gallon
ALTER TABLE public.service_products 
ADD COLUMN IF NOT EXISTS container_amount numeric DEFAULT NULL;

-- Add container_unit field (same as product unit)
ALTER TABLE public.service_products 
ADD COLUMN IF NOT EXISTS container_unit text DEFAULT NULL;

-- Add tracking_method field: 'exact' for solids, 'estimated' for liquids/gel/cream
ALTER TABLE public.service_products 
ADD COLUMN IF NOT EXISTS tracking_method text DEFAULT 'exact' CHECK (tracking_method IN ('exact', 'estimated'));

-- Update unit constraint to remove 'gel' as unit since we already have 'gel' as product_type
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_unit_check;
ALTER TABLE public.products ADD CONSTRAINT products_unit_check 
CHECK (unit IN ('un', 'ml', 'l', 'g', 'kg'));

-- Update existing 'gel' units to 'ml' (most common for gel products)
UPDATE public.products SET unit = 'ml' WHERE unit = 'gel';