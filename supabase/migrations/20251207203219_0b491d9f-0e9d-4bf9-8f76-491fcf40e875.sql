-- Create enum for document types
CREATE TYPE public.document_type AS ENUM ('anamnese', 'contract', 'quote', 'photo', 'other');

-- Create enum for photo stage
CREATE TYPE public.treatment_stage AS ENUM ('before', 'during', 'after');

-- Create enum for quote status
CREATE TYPE public.quote_status AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired');

-- Create storage bucket for client documents
INSERT INTO storage.buckets (id, name, public) VALUES ('client-documents', 'client-documents', false);

-- Create client_documents table for all documents (anamnese, contracts, etc.)
CREATE TABLE public.client_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type document_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT,
  file_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create treatment_photos table for before/during/after photos
CREATE TABLE public.treatment_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  stage treatment_stage NOT NULL,
  file_path TEXT NOT NULL,
  file_url TEXT,
  notes TEXT,
  taken_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create quotes table for budgets/quotations
CREATE TABLE public.quotes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status quote_status NOT NULL DEFAULT 'draft',
  items JSONB NOT NULL DEFAULT '[]',
  total_amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  sent_via TEXT, -- 'whatsapp', 'email', 'in_person', etc.
  sent_at TIMESTAMP WITH TIME ZONE,
  valid_until DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add complementary_info field to clients table
ALTER TABLE public.clients ADD COLUMN complementary_info TEXT;

-- Enable RLS on all new tables
ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

-- RLS policies for client_documents
CREATE POLICY "Authenticated users can view client documents" ON public.client_documents FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert client documents" ON public.client_documents FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can update client documents" ON public.client_documents FOR UPDATE USING (true);
CREATE POLICY "Admins can delete client documents" ON public.client_documents FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for treatment_photos
CREATE POLICY "Authenticated users can view treatment photos" ON public.treatment_photos FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert treatment photos" ON public.treatment_photos FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can update treatment photos" ON public.treatment_photos FOR UPDATE USING (true);
CREATE POLICY "Admins can delete treatment photos" ON public.treatment_photos FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for quotes
CREATE POLICY "Authenticated users can view quotes" ON public.quotes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert quotes" ON public.quotes FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can update quotes" ON public.quotes FOR UPDATE USING (true);
CREATE POLICY "Admins can delete quotes" ON public.quotes FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Storage policies for client-documents bucket
CREATE POLICY "Authenticated users can view client documents storage" ON storage.objects FOR SELECT USING (bucket_id = 'client-documents');
CREATE POLICY "Authenticated users can upload client documents" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'client-documents');
CREATE POLICY "Authenticated users can update client documents storage" ON storage.objects FOR UPDATE USING (bucket_id = 'client-documents');
CREATE POLICY "Admins can delete client documents storage" ON storage.objects FOR DELETE USING (bucket_id = 'client-documents' AND has_role(auth.uid(), 'admin'::app_role));

-- Update triggers for updated_at
CREATE TRIGGER update_client_documents_updated_at BEFORE UPDATE ON public.client_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();