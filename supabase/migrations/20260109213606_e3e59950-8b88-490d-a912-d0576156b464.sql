-- Add content and template_id fields to client_documents table
ALTER TABLE public.client_documents 
ADD COLUMN IF NOT EXISTS content TEXT,
ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.document_templates(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS filled_variables JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS signed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS signed_by TEXT;

-- Add index for template_id
CREATE INDEX IF NOT EXISTS idx_client_documents_template_id ON public.client_documents(template_id);

-- Add comment
COMMENT ON COLUMN public.client_documents.content IS 'Filled document content with replaced variables';
COMMENT ON COLUMN public.client_documents.template_id IS 'Reference to the original template used';
COMMENT ON COLUMN public.client_documents.filled_variables IS 'JSON with the variables and their filled values';
COMMENT ON COLUMN public.client_documents.signed_at IS 'Date and time when document was signed';
COMMENT ON COLUMN public.client_documents.signed_by IS 'Name of person who signed';