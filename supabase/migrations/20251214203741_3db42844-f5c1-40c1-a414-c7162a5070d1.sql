-- Create suppliers table
CREATE TABLE public.suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for suppliers
CREATE POLICY "Authenticated users can view suppliers" 
ON public.suppliers 
FOR SELECT 
USING (true);

CREATE POLICY "Admins and receptionists can insert suppliers" 
ON public.suppliers 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins and receptionists can update suppliers" 
ON public.suppliers 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins can delete suppliers" 
ON public.suppliers 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_suppliers_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create service_products junction table for linking products to services
CREATE TABLE public.service_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity_per_use NUMERIC NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(service_id, product_id)
);

-- Enable RLS
ALTER TABLE public.service_products ENABLE ROW LEVEL SECURITY;

-- RLS Policies for service_products
CREATE POLICY "Authenticated users can view service_products" 
ON public.service_products 
FOR SELECT 
USING (true);

CREATE POLICY "Admins and receptionists can insert service_products" 
ON public.service_products 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins and receptionists can update service_products" 
ON public.service_products 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins can delete service_products" 
ON public.service_products 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_service_products_updated_at
BEFORE UPDATE ON public.service_products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add supplier_id column to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id);

-- Add supplier_id column to product_purchases table
ALTER TABLE public.product_purchases ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id);

-- Create function to decrease stock when appointment is completed
CREATE OR REPLACE FUNCTION public.decrease_product_stock_on_appointment_complete()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process when status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Decrease stock for all products linked to the service
    UPDATE public.products p
    SET current_stock = GREATEST(0, p.current_stock - sp.quantity_per_use),
        updated_at = now()
    FROM public.service_products sp
    WHERE sp.product_id = p.id
      AND sp.service_id = NEW.service_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for automatic stock decrease
CREATE TRIGGER decrease_stock_on_appointment_complete
AFTER UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.decrease_product_stock_on_appointment_complete();