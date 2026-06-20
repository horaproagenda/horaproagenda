
-- ============================================================
-- Payment integrity: garante que agendamentos vinculados a vendas/pacotes
-- pagos sempre fiquem com payment_status='paid' e amount_paid coerente.
-- Cria trigger em single_sales para sincronização automática + função de
-- auditoria/repare para self-healing contínuo.
-- ============================================================

-- 1. Função que sincroniza appointments quando a venda já está paga
CREATE OR REPLACE FUNCTION public.sync_appointments_with_paid_sale(_sale_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sale RECORD;
  _pkg_total numeric;
  _svc_price numeric;
  _updated integer := 0;
BEGIN
  SELECT * INTO _sale FROM public.single_sales WHERE id = _sale_id;
  IF NOT FOUND OR _sale.paid_at IS NULL THEN
    RETURN 0;
  END IF;

  IF _sale.item_type = 'package' AND _sale.package_id IS NOT NULL THEN
    SELECT total_price INTO _pkg_total FROM public.service_packages WHERE id = _sale.package_id;
    UPDATE public.appointments a
       SET payment_status = 'paid',
           amount_paid = GREATEST(COALESCE(a.amount_paid,0), COALESCE(_pkg_total,0)),
           updated_at = now()
     WHERE a.client_id = _sale.client_id
       AND a.package_appointment_id IN (
         SELECT id FROM public.package_appointments WHERE package_id = _sale.package_id
       )
       AND (a.payment_status IS DISTINCT FROM 'paid' OR COALESCE(a.amount_paid,0) < COALESCE(_pkg_total,0));
    GET DIAGNOSTICS _updated = ROW_COUNT;

  ELSIF _sale.item_type = 'service' AND _sale.service_id IS NOT NULL THEN
    SELECT price INTO _svc_price FROM public.services WHERE id = _sale.service_id;
    UPDATE public.appointments a
       SET payment_status = 'paid',
           amount_paid = GREATEST(COALESCE(a.amount_paid,0), COALESCE(_sale.final_amount, _svc_price, 0)),
           updated_at = now()
     WHERE a.client_id = _sale.client_id
       AND a.service_id = _sale.service_id
       AND a.package_appointment_id IS NULL
       AND a.payment_status IS DISTINCT FROM 'paid'
       AND a.start_time >= _sale.sale_date::timestamptz - INTERVAL '1 day';
    GET DIAGNOSTICS _updated = ROW_COUNT;
  END IF;

  RETURN _updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_appointments_with_paid_sale(uuid) TO authenticated, service_role;

-- 2. Trigger em single_sales: auto sync ao inserir/atualizar venda paga
CREATE OR REPLACE FUNCTION public.trg_single_sales_sync_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.paid_at IS NOT NULL THEN
    PERFORM public.sync_appointments_with_paid_sale(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS single_sales_sync_payment ON public.single_sales;
CREATE TRIGGER single_sales_sync_payment
  AFTER INSERT OR UPDATE OF paid_at, final_amount, package_id, service_id, item_type
  ON public.single_sales
  FOR EACH ROW EXECUTE FUNCTION public.trg_single_sales_sync_payment();

-- 3. Auditoria de pagamento — lista agendamentos com cobrança indevida
CREATE OR REPLACE FUNCTION public.audit_payment_integrity()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'package_appointments_pending_with_paid_sale',
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'appointment_id', a.id,
          'client_id', a.client_id,
          'package_id', sp.id,
          'package_name', sp.name,
          'sale_id', ss.id
        ))
        FROM public.appointments a
        JOIN public.package_appointments pa ON pa.id = a.package_appointment_id
        JOIN public.service_packages sp ON sp.id = pa.package_id
        JOIN public.single_sales ss ON ss.package_id = sp.id AND ss.client_id = a.client_id
        WHERE ss.paid_at IS NOT NULL
          AND a.payment_status IS DISTINCT FROM 'paid'
      ), '[]'::jsonb),
    'service_appointments_pending_with_paid_sale',
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'appointment_id', a.id,
          'client_id', a.client_id,
          'service_id', a.service_id,
          'sale_id', ss.id
        ))
        FROM public.appointments a
        JOIN public.single_sales ss
          ON ss.client_id = a.client_id
         AND ss.service_id = a.service_id
         AND ss.item_type = 'service'
        WHERE ss.paid_at IS NOT NULL
          AND a.package_appointment_id IS NULL
          AND a.payment_status IS DISTINCT FROM 'paid'
      ), '[]'::jsonb)
  ) INTO _result;
  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_payment_integrity() TO authenticated, service_role;

-- 4. Repare em massa — roda o sync para toda venda paga
CREATE OR REPLACE FUNCTION public.repair_payment_integrity()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sale RECORD;
  _total integer := 0;
  _n integer;
BEGIN
  FOR _sale IN SELECT id FROM public.single_sales WHERE paid_at IS NOT NULL LOOP
    _n := public.sync_appointments_with_paid_sale(_sale.id);
    _total := _total + COALESCE(_n,0);
  END LOOP;
  RETURN _total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.repair_payment_integrity() TO authenticated, service_role;

-- 5. Executa o repare uma vez para corrigir histórico (Lívia + outros clientes)
SELECT public.repair_payment_integrity();
