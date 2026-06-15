-- 1) Vincular financial_entries a uma venda específica
ALTER TABLE public.financial_entries
  ADD COLUMN IF NOT EXISTS sale_id uuid REFERENCES public.single_sales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_financial_entries_sale_id ON public.financial_entries(sale_id);
CREATE INDEX IF NOT EXISTS idx_boleto_installments_sale_id ON public.boleto_installments(sale_id);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_ref ON public.cash_transactions(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_client_services_sale_id ON public.client_services(sale_id);

-- Backfill simples: associa financial_entries de "Venda:" pela combinação client_id + amount + paid_date
UPDATE public.financial_entries fe
SET sale_id = s.id
FROM public.single_sales s
WHERE fe.sale_id IS NULL
  AND fe.client_id IS NOT NULL
  AND fe.client_id = s.client_id
  AND fe.paid_date = s.sale_date
  AND ROUND(fe.amount::numeric, 2) = ROUND(s.final_amount::numeric, 2)
  AND fe.description ILIKE 'Venda:%';

-- 2) Função SECURITY DEFINER: limpa em cascata tudo que pertence a uma venda
CREATE OR REPLACE FUNCTION public.purge_single_sale_cascade(_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sale RECORD;
  _result jsonb := jsonb_build_object();
  _deleted_appointments int := 0;
  _deleted_package_appts int := 0;
  _deleted_package int := 0;
  _deleted_client_services int := 0;
  _deleted_financial int := 0;
  _deleted_cash int := 0;
  _deleted_boletos int := 0;
BEGIN
  SELECT * INTO _sale FROM public.single_sales WHERE id = _sale_id;
  IF _sale.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sale_not_found');
  END IF;

  -- Validar permissão (usuário só pode purgar vendas do seu account_owner)
  IF auth.uid() IS NOT NULL
     AND _sale.account_owner_id IS NOT NULL
     AND _sale.account_owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  -- a) appointments vinculados (via package_appointments do pacote desta venda)
  IF _sale.item_type = 'package' AND _sale.package_id IS NOT NULL THEN
    WITH del AS (
      DELETE FROM public.appointments
      WHERE package_appointment_id IN (
        SELECT id FROM public.package_appointments WHERE package_id = _sale.package_id
      )
      RETURNING 1
    ) SELECT count(*) INTO _deleted_appointments FROM del;

    WITH del AS (
      DELETE FROM public.package_appointments WHERE package_id = _sale.package_id
      RETURNING 1
    ) SELECT count(*) INTO _deleted_package_appts FROM del;

    -- Apaga o pacote se não houver outra venda apontando para ele
    IF NOT EXISTS (
      SELECT 1 FROM public.single_sales
      WHERE package_id = _sale.package_id AND id <> _sale_id
    ) THEN
      WITH del AS (
        DELETE FROM public.service_packages WHERE id = _sale.package_id
        RETURNING 1
      ) SELECT count(*) INTO _deleted_package FROM del;
    END IF;
  END IF;

  -- b) client_services criados pela venda (serviço avulso pago)
  WITH del AS (
    DELETE FROM public.client_services WHERE sale_id = _sale_id RETURNING 1
  ) SELECT count(*) INTO _deleted_client_services FROM del;

  -- c) financial_entries vinculadas pela coluna sale_id
  WITH del AS (
    DELETE FROM public.financial_entries WHERE sale_id = _sale_id RETURNING 1
  ) SELECT count(*) INTO _deleted_financial FROM del;

  -- d) cash_transactions criadas pela venda
  WITH del AS (
    DELETE FROM public.cash_transactions
    WHERE reference_type = 'single_sale' AND reference_id = _sale_id
    RETURNING 1
  ) SELECT count(*) INTO _deleted_cash FROM del;

  -- e) boleto_installments residuais
  WITH del AS (
    DELETE FROM public.boleto_installments WHERE sale_id = _sale_id RETURNING 1
  ) SELECT count(*) INTO _deleted_boletos FROM del;

  -- f) a venda em si
  DELETE FROM public.single_sales WHERE id = _sale_id;

  _result := jsonb_build_object(
    'ok', true,
    'sale_id', _sale_id,
    'deleted_appointments', _deleted_appointments,
    'deleted_package_appointments', _deleted_package_appts,
    'deleted_service_package', _deleted_package,
    'deleted_client_services', _deleted_client_services,
    'deleted_financial_entries', _deleted_financial,
    'deleted_cash_transactions', _deleted_cash,
    'deleted_boleto_installments', _deleted_boletos
  );
  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_single_sale_cascade(uuid) TO authenticated;

-- 3) Trigger: quando todos os boletos de uma venda são excluídos, cascateia
CREATE OR REPLACE FUNCTION public.auto_purge_sale_on_boletos_cleared()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _remaining int;
  _sale_exists boolean;
BEGIN
  IF OLD.sale_id IS NULL THEN RETURN OLD; END IF;
  SELECT EXISTS(SELECT 1 FROM public.single_sales WHERE id = OLD.sale_id) INTO _sale_exists;
  IF NOT _sale_exists THEN RETURN OLD; END IF;
  SELECT count(*) INTO _remaining FROM public.boleto_installments WHERE sale_id = OLD.sale_id;
  IF _remaining = 0 THEN
    PERFORM public.purge_single_sale_cascade(OLD.sale_id);
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_purge_sale_on_boletos_cleared ON public.boleto_installments;
CREATE TRIGGER trg_auto_purge_sale_on_boletos_cleared
AFTER DELETE ON public.boleto_installments
FOR EACH ROW
EXECUTE FUNCTION public.auto_purge_sale_on_boletos_cleared();

-- 4) Diagnóstico de integridade do fluxo financeiro/agenda
CREATE OR REPLACE FUNCTION public.audit_sale_flow_integrity()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid := auth.uid();
  _result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'sales_with_boleto_no_installments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'client_id', s.client_id, 'final_amount', s.final_amount, 'sale_date', s.sale_date))
      FROM public.single_sales s
      JOIN public.payment_methods pm ON pm.id = s.payment_method_id
      WHERE (s.account_owner_id = _owner OR _owner IS NULL)
        AND pm.name ILIKE '%boleto%'
        AND NOT EXISTS (SELECT 1 FROM public.boleto_installments bi WHERE bi.sale_id = s.id)
    ), '[]'::jsonb),
    'packages_without_active_sale', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'client_id', p.client_id))
      FROM public.service_packages p
      WHERE (p.account_owner_id = _owner OR _owner IS NULL)
        AND p.client_id IS NOT NULL
        AND p.category = 'Pago via Caixa'
        AND NOT EXISTS (SELECT 1 FROM public.single_sales s WHERE s.package_id = p.id)
    ), '[]'::jsonb),
    'client_services_without_sale', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', cs.id, 'client_id', cs.client_id, 'service_id', cs.service_id))
      FROM public.client_services cs
      WHERE (cs.account_owner_id = _owner OR _owner IS NULL)
        AND cs.sale_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.single_sales s WHERE s.id = cs.sale_id)
    ), '[]'::jsonb),
    'financial_entries_without_sale', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', fe.id, 'description', fe.description, 'amount', fe.amount))
      FROM public.financial_entries fe
      WHERE (fe.account_owner_id = _owner OR _owner IS NULL)
        AND fe.sale_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.single_sales s WHERE s.id = fe.sale_id)
    ), '[]'::jsonb)
  ) INTO _result;
  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_sale_flow_integrity() TO authenticated;

-- 5) Limpeza imediata das vendas-fantasma já identificadas (boleto sem parcelas)
DO $$
DECLARE _id uuid;
BEGIN
  FOR _id IN
    SELECT s.id
    FROM public.single_sales s
    JOIN public.payment_methods pm ON pm.id = s.payment_method_id
    WHERE pm.name ILIKE '%boleto%'
      AND NOT EXISTS (SELECT 1 FROM public.boleto_installments bi WHERE bi.sale_id = s.id)
  LOOP
    PERFORM public.purge_single_sale_cascade(_id);
  END LOOP;
END $$;