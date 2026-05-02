-- Beneficiary fields on professionals
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS beneficiary_address text,
  ADD COLUMN IF NOT EXISTS beneficiary_cep text,
  ADD COLUMN IF NOT EXISTS beneficiary_city text,
  ADD COLUMN IF NOT EXISTS beneficiary_state text;

-- Address fields on clients (payer info)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS address_street text,
  ADD COLUMN IF NOT EXISTS address_number text,
  ADD COLUMN IF NOT EXISTS address_complement text,
  ADD COLUMN IF NOT EXISTS address_neighborhood text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_state text,
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS company_name text;

-- Per-installment boleto detail fields
ALTER TABLE public.boleto_installments
  ADD COLUMN IF NOT EXISTS interest_percent_per_day numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fine_percent numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_until_date date,
  ADD COLUMN IF NOT EXISTS nosso_numero text,
  ADD COLUMN IF NOT EXISTS document_number text,
  ADD COLUMN IF NOT EXISTS service_description text,
  ADD COLUMN IF NOT EXISTS payer_snapshot jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS beneficiary_snapshot jsonb DEFAULT '{}'::jsonb;

-- Sequence for "Nosso número" (internal unique tracking code)
CREATE SEQUENCE IF NOT EXISTS public.boleto_nosso_numero_seq START 1;

CREATE OR REPLACE FUNCTION public.assign_boleto_nosso_numero()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_seq bigint;
BEGIN
  IF NEW.nosso_numero IS NULL OR NEW.nosso_numero = '' THEN
    v_seq := nextval('public.boleto_nosso_numero_seq');
    NEW.nosso_numero := lpad(v_seq::text, 10, '0');
  END IF;
  IF NEW.document_number IS NULL OR NEW.document_number = '' THEN
    NEW.document_number := 'DOC-' || substr(NEW.sale_id::text, 1, 8) || '-' || lpad(NEW.installment_number::text, 2, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_boleto_nosso_numero ON public.boleto_installments;
CREATE TRIGGER trg_assign_boleto_nosso_numero
BEFORE INSERT ON public.boleto_installments
FOR EACH ROW EXECUTE FUNCTION public.assign_boleto_nosso_numero();