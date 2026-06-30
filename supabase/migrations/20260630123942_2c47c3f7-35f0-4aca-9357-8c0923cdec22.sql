ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS business_type_label text;

COMMENT ON COLUMN public.business_settings.business_type IS 'Tipo de estabelecimento (clinica, salao, barbearia, odontologia, psicologia, fisioterapia, fonoaudiologia, nutricao, estetica, podologia, veterinaria, terapia, outro)';
COMMENT ON COLUMN public.business_settings.business_type_label IS 'Rótulo personalizado quando business_type = outro';