-- Create table to track paid services available for use
CREATE TABLE public.client_services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES public.single_sales(id) ON DELETE SET NULL,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'available', -- 'available', 'used', 'expired'
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

-- Enable RLS
ALTER TABLE public.client_services ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view client_services"
  ON public.client_services FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'receptionist'::app_role) OR
    (has_role(auth.uid(), 'professional'::app_role) AND EXISTS (
      SELECT 1 FROM clients c WHERE c.id = client_services.client_id 
      AND (c.assigned_professional_id = get_professional_id_for_user(auth.uid()) OR c.assigned_professional_id IS NULL)
    ))
  );

CREATE POLICY "Admins and receptionists can insert client_services"
  ON public.client_services FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins and receptionists can update client_services"
  ON public.client_services FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Only admins can delete client_services"
  ON public.client_services FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for better performance
CREATE INDEX idx_client_services_client_id ON public.client_services(client_id);
CREATE INDEX idx_client_services_status ON public.client_services(status);