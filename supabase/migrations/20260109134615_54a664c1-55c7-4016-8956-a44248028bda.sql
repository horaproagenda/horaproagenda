-- Fix 1: WhatsApp Templates RLS - Add TO authenticated clause
DROP POLICY IF EXISTS "Authenticated users can view whatsapp_templates" ON public.whatsapp_templates;
CREATE POLICY "Authenticated users can view whatsapp_templates" 
ON public.whatsapp_templates 
FOR SELECT TO authenticated
USING (true);

-- Fix 2: Add database CHECK constraints for critical tables
-- Using DO block to handle existing constraints gracefully

DO $$ 
BEGIN
  -- Clients table constraints
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_name_length') THEN
    ALTER TABLE public.clients ADD CONSTRAINT client_name_length 
      CHECK (length(name) >= 2 AND length(name) <= 100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_email_length') THEN
    ALTER TABLE public.clients ADD CONSTRAINT client_email_length 
      CHECK (email IS NULL OR length(email) <= 255);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_phone_length') THEN
    ALTER TABLE public.clients ADD CONSTRAINT client_phone_length 
      CHECK (length(phone) >= 8 AND length(phone) <= 20);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_notes_length') THEN
    ALTER TABLE public.clients ADD CONSTRAINT client_notes_length 
      CHECK (notes IS NULL OR length(notes) <= 2000);
  END IF;

  -- Services table constraints
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_name_length') THEN
    ALTER TABLE public.services ADD CONSTRAINT service_name_length 
      CHECK (length(name) >= 2 AND length(name) <= 100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_price_positive') THEN
    ALTER TABLE public.services ADD CONSTRAINT service_price_positive 
      CHECK (price >= 0);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_duration_positive') THEN
    ALTER TABLE public.services ADD CONSTRAINT service_duration_positive 
      CHECK (duration > 0);
  END IF;

  -- Products table constraints
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_name_length') THEN
    ALTER TABLE public.products ADD CONSTRAINT product_name_length 
      CHECK (length(name) >= 2 AND length(name) <= 100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_stock_non_negative') THEN
    ALTER TABLE public.products ADD CONSTRAINT product_stock_non_negative 
      CHECK (current_stock >= 0);
  END IF;

  -- Professionals table constraints
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'professional_name_length') THEN
    ALTER TABLE public.professionals ADD CONSTRAINT professional_name_length 
      CHECK (length(name) >= 2 AND length(name) <= 100);
  END IF;

  -- Financial entries table constraints
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financial_amount_positive') THEN
    ALTER TABLE public.financial_entries ADD CONSTRAINT financial_amount_positive 
      CHECK (amount >= 0);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financial_description_length') THEN
    ALTER TABLE public.financial_entries ADD CONSTRAINT financial_description_length 
      CHECK (length(description) >= 1 AND length(description) <= 500);
  END IF;
END $$;