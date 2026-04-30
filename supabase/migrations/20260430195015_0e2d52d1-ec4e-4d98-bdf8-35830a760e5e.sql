
-- Add split_fee to card_brands
ALTER TABLE public.card_brands ADD COLUMN IF NOT EXISTS split_fee boolean NOT NULL DEFAULT false;

-- Create boleto audit log table
CREATE TABLE public.boleto_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boleto_installment_id uuid REFERENCES public.boleto_installments(id) ON DELETE SET NULL,
  sale_id uuid,
  event_type text NOT NULL CHECK (event_type IN ('sync', 'payment', 'edit', 'cancel', 'batch_payment', 'create')),
  event_source text NOT NULL CHECK (event_source IN ('webhook', 'user', 'system')),
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_status text,
  new_status text,
  previous_amount numeric,
  new_amount numeric,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.boleto_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view boleto audit logs"
  ON public.boleto_audit_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create boleto audit logs"
  ON public.boleto_audit_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX idx_boleto_audit_log_installment ON public.boleto_audit_log(boleto_installment_id);
CREATE INDEX idx_boleto_audit_log_sale ON public.boleto_audit_log(sale_id);

-- Trigger to validate partial payments don't exceed total
CREATE OR REPLACE FUNCTION public.validate_boleto_partial_payment()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_total_paid numeric;
  v_sale_total numeric;
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    -- Sum all paid installments for the same sale (including this one)
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM public.boleto_installments
    WHERE sale_id = NEW.sale_id
      AND status = 'paid'
      AND id != NEW.id;

    v_total_paid := v_total_paid + NEW.amount;

    -- Get the sale total
    SELECT COALESCE(final_amount, original_amount) INTO v_sale_total
    FROM public.single_sales
    WHERE id = NEW.sale_id;

    IF v_sale_total IS NOT NULL AND v_total_paid > v_sale_total + 0.01 THEN
      RAISE EXCEPTION 'A soma das parcelas pagas (R$ %) ultrapassa o valor total do boleto (R$ %). Operação bloqueada.', 
        ROUND(v_total_paid, 2), ROUND(v_sale_total, 2);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_boleto_partial_payment
  BEFORE UPDATE ON public.boleto_installments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_boleto_partial_payment();
