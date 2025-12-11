-- Add category column to service_packages table
ALTER TABLE public.service_packages 
ADD COLUMN category text;