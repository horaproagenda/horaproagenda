-- Add is_for_sale column to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS is_for_sale BOOLEAN NOT NULL DEFAULT false;

-- Add sale_price column for products meant for sale
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS sale_price DECIMAL(10,2) DEFAULT 0;

COMMENT ON COLUMN public.products.is_for_sale IS 'Indicates if this product is available for direct sale to customers';
COMMENT ON COLUMN public.products.sale_price IS 'Sale price for products available for customer sale';