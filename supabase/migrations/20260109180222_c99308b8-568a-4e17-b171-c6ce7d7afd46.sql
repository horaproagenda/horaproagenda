-- Drop the old table that was linking to service_packages (wrong approach)
DROP TABLE IF EXISTS public.package_products;

-- Create table to link products to package TEMPLATES (not sold packages)
CREATE TABLE public.package_template_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.package_templates(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity_per_use NUMERIC NOT NULL DEFAULT 1,
  estimated_appointments INTEGER,
  container_amount NUMERIC,
  container_unit TEXT,
  tracking_method TEXT DEFAULT 'exact' CHECK (tracking_method IN ('exact', 'estimated')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(template_id, product_id)
);

-- Enable RLS
ALTER TABLE public.package_template_products ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Package template products are viewable by authenticated users" 
ON public.package_template_products FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Package template products can be created by authenticated users" 
ON public.package_template_products FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Package template products can be updated by authenticated users" 
ON public.package_template_products FOR UPDATE 
TO authenticated
USING (true);

CREATE POLICY "Package template products can be deleted by authenticated users" 
ON public.package_template_products FOR DELETE 
TO authenticated
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_package_template_products_updated_at
BEFORE UPDATE ON public.package_template_products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create table to track product consumption per appointment
CREATE TABLE public.appointment_product_consumption (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity_used NUMERIC NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL CHECK (source_type IN ('service', 'package_template')),
  source_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(appointment_id, product_id)
);

-- Enable RLS
ALTER TABLE public.appointment_product_consumption ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Consumption records are viewable by authenticated users" 
ON public.appointment_product_consumption FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Consumption records can be created by authenticated users" 
ON public.appointment_product_consumption FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Consumption records can be deleted by authenticated users" 
ON public.appointment_product_consumption FOR DELETE 
TO authenticated
USING (true);