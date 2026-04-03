ALTER TABLE public.business_settings 
  ADD COLUMN IF NOT EXISTS saturday_opening_time text DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS saturday_closing_time text DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS sunday_opening_time text DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS sunday_closing_time text DEFAULT '18:00';