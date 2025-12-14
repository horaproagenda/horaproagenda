-- Create products table
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  brand TEXT,
  category TEXT,
  product_type TEXT NOT NULL DEFAULT 'solid' CHECK (product_type IN ('solid', 'liquid', 'cream', 'powder', 'other')),
  unit TEXT NOT NULL DEFAULT 'un' CHECK (unit IN ('un', 'ml', 'l', 'g', 'kg')),
  quantity_purchased NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total_price NUMERIC NOT NULL DEFAULT 0,
  supplier TEXT,
  purchase_date DATE,
  expiry_date DATE,
  started_using_at DATE,
  finished_at DATE,
  current_stock NUMERIC NOT NULL DEFAULT 0,
  min_stock_alert NUMERIC DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID
);

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view products"
ON public.products FOR SELECT
USING (true);

CREATE POLICY "Admins and receptionists can insert products"
ON public.products FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'receptionist'));

CREATE POLICY "Admins and receptionists can update products"
ON public.products FOR UPDATE
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'receptionist'));

CREATE POLICY "Admins can delete products"
ON public.products FOR DELETE
USING (has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create product_purchases table for tracking purchases history
CREATE TABLE public.product_purchases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total_price NUMERIC NOT NULL DEFAULT 0,
  supplier TEXT,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  started_using_at DATE,
  finished_at DATE,
  duration_days INTEGER GENERATED ALWAYS AS (
    CASE WHEN finished_at IS NOT NULL AND started_using_at IS NOT NULL 
    THEN finished_at - started_using_at 
    ELSE NULL END
  ) STORED,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID
);

-- Enable RLS
ALTER TABLE public.product_purchases ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view product purchases"
ON public.product_purchases FOR SELECT
USING (true);

CREATE POLICY "Admins and receptionists can insert product purchases"
ON public.product_purchases FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'receptionist'));

CREATE POLICY "Admins and receptionists can update product purchases"
ON public.product_purchases FOR UPDATE
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'receptionist'));

CREATE POLICY "Admins can delete product purchases"
ON public.product_purchases FOR DELETE
USING (has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_product_purchases_updated_at
BEFORE UPDATE ON public.product_purchases
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();