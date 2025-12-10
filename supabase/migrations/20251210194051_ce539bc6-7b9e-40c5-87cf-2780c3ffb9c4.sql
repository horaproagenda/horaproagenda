-- Drop the package_items table as we're removing service selection
DROP TABLE IF EXISTS public.package_items;

-- Alter service_packages to new structure
ALTER TABLE public.service_packages 
ADD COLUMN client_id uuid REFERENCES public.clients(id),
ADD COLUMN total_sessions integer NOT NULL DEFAULT 1,
ADD COLUMN sessions_scheduled integer NOT NULL DEFAULT 0,
ADD COLUMN interval_days integer DEFAULT 7,
ADD COLUMN auto_schedule boolean NOT NULL DEFAULT false,
ADD COLUMN preferred_day_of_week integer CHECK (preferred_day_of_week >= 0 AND preferred_day_of_week <= 6),
ADD COLUMN preferred_time time,
ADD COLUMN payment_method text,
ADD COLUMN whatsapp_reminder boolean NOT NULL DEFAULT true;

-- Rename price to total_price for clarity
ALTER TABLE public.service_packages RENAME COLUMN price TO total_price;

-- Create table for package appointment history
CREATE TABLE public.package_appointments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id uuid NOT NULL REFERENCES public.service_packages(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  session_number integer NOT NULL,
  scheduled_date timestamp with time zone,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'completed', 'cancelled')),
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on package_appointments
ALTER TABLE public.package_appointments ENABLE ROW LEVEL SECURITY;

-- RLS policies for package_appointments
CREATE POLICY "Authenticated users can view package appointments"
ON public.package_appointments FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert package appointments"
ON public.package_appointments FOR INSERT
WITH CHECK (true);

CREATE POLICY "Authenticated users can update package appointments"
ON public.package_appointments FOR UPDATE
USING (true);

CREATE POLICY "Admins can delete package appointments"
ON public.package_appointments FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_package_appointments_updated_at
BEFORE UPDATE ON public.package_appointments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();