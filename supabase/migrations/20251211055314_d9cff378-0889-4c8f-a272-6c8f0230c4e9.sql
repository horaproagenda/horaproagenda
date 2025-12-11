-- Add drag_and_drop_enabled column to business_settings
ALTER TABLE public.business_settings 
ADD COLUMN IF NOT EXISTS drag_and_drop_enabled boolean NOT NULL DEFAULT true;