
ALTER TABLE public.business_settings 
ADD COLUMN IF NOT EXISTS overdue_days_threshold integer NOT NULL DEFAULT 0;

ALTER TABLE public.financial_entries 
ADD COLUMN IF NOT EXISTS original_amount numeric DEFAULT NULL;
