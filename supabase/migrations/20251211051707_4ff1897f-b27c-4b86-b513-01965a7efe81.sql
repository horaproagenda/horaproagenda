-- Create settings table for business configuration
CREATE TABLE public.business_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  opening_time time NOT NULL DEFAULT '08:00',
  closing_time time NOT NULL DEFAULT '20:00',
  slot_interval integer NOT NULL DEFAULT 30,
  work_saturdays boolean NOT NULL DEFAULT true,
  work_sundays boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Authenticated users can view settings"
ON public.business_settings
FOR SELECT
USING (true);

CREATE POLICY "Admins can update settings"
ON public.business_settings
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert settings"
ON public.business_settings
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default settings
INSERT INTO public.business_settings (opening_time, closing_time, slot_interval, work_saturdays, work_sundays)
VALUES ('08:00', '20:00', 30, true, false);