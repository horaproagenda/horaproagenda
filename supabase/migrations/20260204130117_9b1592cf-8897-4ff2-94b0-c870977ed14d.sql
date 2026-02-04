-- Create table for public document fill links
CREATE TABLE public.document_fill_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.document_templates(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE,
  filled_at TIMESTAMP WITH TIME ZONE,
  filled_content TEXT,
  filled_variables JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'filled', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for token lookup (public access)
CREATE INDEX idx_document_fill_links_token ON public.document_fill_links(token);

-- Enable RLS
ALTER TABLE public.document_fill_links ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to manage links
CREATE POLICY "Authenticated users can manage document fill links" 
ON public.document_fill_links 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Policy for public access to read/update by token (for client filling)
CREATE POLICY "Anyone can read and fill documents by token" 
ON public.document_fill_links 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can update filled content by token" 
ON public.document_fill_links 
FOR UPDATE 
USING (true)
WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_document_fill_links_updated_at
BEFORE UPDATE ON public.document_fill_links
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();