
ALTER TABLE public.professional_preferences
  ADD COLUMN IF NOT EXISTS primary_color text,
  ADD COLUMN IF NOT EXISTS dark_mode boolean,
  ADD COLUMN IF NOT EXISTS animations boolean;
