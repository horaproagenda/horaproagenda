-- Create package_templates table for pre-registered packages
CREATE TABLE public.package_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  total_sessions INTEGER NOT NULL DEFAULT 1,
  price NUMERIC NOT NULL,
  duration INTEGER NOT NULL DEFAULT 60,
  interval_days INTEGER DEFAULT 7,
  professional_id UUID REFERENCES public.professionals(id),
  room_id UUID REFERENCES public.rooms(id),
  equipment TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.package_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for package_templates
CREATE POLICY "Authenticated users can view package templates" 
ON public.package_templates FOR SELECT 
USING (true);

CREATE POLICY "Admins can insert package templates" 
ON public.package_templates FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update package templates" 
ON public.package_templates FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete package templates" 
ON public.package_templates FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add new columns to service_packages
ALTER TABLE public.service_packages
ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.package_templates(id),
ADD COLUMN IF NOT EXISTS professional_id UUID REFERENCES public.professionals(id),
ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES public.rooms(id),
ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 60,
ADD COLUMN IF NOT EXISTS equipment TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS payment_methods TEXT[] DEFAULT '{}';

-- Create trigger for updated_at on package_templates
CREATE TRIGGER update_package_templates_updated_at
BEFORE UPDATE ON public.package_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();