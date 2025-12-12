-- Add new appointment status values
ALTER TYPE appointment_status ADD VALUE IF NOT EXISTS 'missed';
ALTER TYPE appointment_status ADD VALUE IF NOT EXISTS 'rescheduled';

-- Add created_by column to appointments for tracking who scheduled
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- Add auto_complete_appointments setting to business_settings
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS auto_complete_appointments boolean NOT NULL DEFAULT false;

-- Create professional_absences table for tracking professional time off
CREATE TABLE IF NOT EXISTS public.professional_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  start_time timestamp with time zone NOT NULL,
  end_time timestamp with time zone NOT NULL,
  reason text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on professional_absences
ALTER TABLE public.professional_absences ENABLE ROW LEVEL SECURITY;

-- RLS policies for professional_absences
CREATE POLICY "Authenticated users can view professional absences"
ON public.professional_absences FOR SELECT
USING (true);

CREATE POLICY "Admins and receptionists can insert professional absences"
ON public.professional_absences FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'receptionist'));

CREATE POLICY "Admins and receptionists can update professional absences"
ON public.professional_absences FOR UPDATE
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'receptionist'));

CREATE POLICY "Admins can delete professional absences"
ON public.professional_absences FOR DELETE
USING (has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at on professional_absences
CREATE TRIGGER update_professional_absences_updated_at
BEFORE UPDATE ON public.professional_absences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();