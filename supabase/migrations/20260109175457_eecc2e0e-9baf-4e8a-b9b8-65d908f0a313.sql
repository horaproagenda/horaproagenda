-- Create table for linking products to packages (similar to service_products)
CREATE TABLE IF NOT EXISTS public.package_products (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    package_id UUID NOT NULL REFERENCES public.service_packages(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity_per_use NUMERIC NOT NULL DEFAULT 1,
    estimated_appointments INTEGER NULL,
    container_amount NUMERIC NULL,
    container_unit TEXT NULL,
    tracking_method TEXT DEFAULT 'exact' CHECK (tracking_method IN ('exact', 'estimated')),
    notes TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(package_id, product_id)
);

-- Enable RLS
ALTER TABLE public.package_products ENABLE ROW LEVEL SECURITY;

-- Create policies for package_products
CREATE POLICY "Users can view package products" 
ON public.package_products FOR SELECT 
USING (true);

CREATE POLICY "Users can manage package products" 
ON public.package_products FOR ALL 
USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_package_products_updated_at
BEFORE UPDATE ON public.package_products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for performance
CREATE INDEX idx_package_products_package_id ON public.package_products(package_id);
CREATE INDEX idx_package_products_product_id ON public.package_products(product_id);