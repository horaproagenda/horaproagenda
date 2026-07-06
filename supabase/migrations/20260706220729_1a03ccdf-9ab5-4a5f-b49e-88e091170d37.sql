-- Remove trigger legado que revertia products.started_using_at para o MIN
-- de todas as compras. Isso fazia com que "Iniciar uso hoje" fosse
-- sobrescrito segundos depois pela data da primeira compra antiga.
-- O trigger sync_product_active_cycle (mais novo) já mantém a compra
-- ativa correta em espelho no produto.
DROP TRIGGER IF EXISTS trg_sync_product_usage_dates_from_purchases ON public.product_purchases;
DROP FUNCTION IF EXISTS public.sync_product_usage_dates_from_purchases();

-- Reescreve heal_legacy_data para usar a COMPRA ATIVA (started_using_at
-- não nulo e finished_at nulo, mais recente) em vez de MIN(started_using_at).
-- Assim o "auto-heal" que roda após novas versões deixa de reverter o
-- início do ciclo escolhido pelo usuário.
CREATE OR REPLACE FUNCTION public.heal_legacy_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appts_payment INTEGER := 0;
  v_appts_amount INTEGER := 0;
  v_sales_final INTEGER := 0;
  v_pkg_orig INTEGER := 0;
  v_products_sync INTEGER := 0;
  v_pkg_recalc INTEGER := 0;
  rec RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem executar a atualização de dados antigos.';
  END IF;

  UPDATE public.appointments
     SET payment_status = 'pending', updated_at = now()
   WHERE payment_status IS NULL;
  GET DIAGNOSTICS v_appts_payment = ROW_COUNT;

  UPDATE public.appointments
     SET amount_paid = 0, updated_at = now()
   WHERE amount_paid IS NULL;
  GET DIAGNOSTICS v_appts_amount = ROW_COUNT;

  UPDATE public.single_sales
     SET final_amount = GREATEST(COALESCE(original_amount, 0) - COALESCE(discount_amount, 0), 0)
   WHERE final_amount IS NULL;
  GET DIAGNOSTICS v_sales_final = ROW_COUNT;

  UPDATE public.package_appointments
     SET original_session_number = session_number
   WHERE original_session_number IS NULL
     AND session_number IS NOT NULL;
  GET DIAGNOSTICS v_pkg_orig = ROW_COUNT;

  -- 5. Re-sync products dates a partir da COMPRA ATIVA (mais recente sem
  -- finished_at). Se não houver compra ativa, usa a última compra fechada.
  FOR rec IN
    SELECT DISTINCT product_id FROM public.product_purchases
  LOOP
    WITH active_purchase AS (
      SELECT started_using_at, finished_at
        FROM public.product_purchases
       WHERE product_id = rec.product_id
         AND started_using_at IS NOT NULL
         AND finished_at IS NULL
       ORDER BY started_using_at DESC, created_at DESC
       LIMIT 1
    ),
    last_closed AS (
      SELECT started_using_at, finished_at
        FROM public.product_purchases
       WHERE product_id = rec.product_id
         AND started_using_at IS NOT NULL
         AND finished_at IS NOT NULL
       ORDER BY finished_at DESC, started_using_at DESC, created_at DESC
       LIMIT 1
    ),
    chosen AS (
      SELECT started_using_at, finished_at FROM active_purchase
      UNION ALL
      SELECT started_using_at, finished_at FROM last_closed
      WHERE NOT EXISTS (SELECT 1 FROM active_purchase)
      LIMIT 1
    )
    UPDATE public.products p
       SET started_using_at = c.started_using_at,
           finished_at = c.finished_at,
           updated_at = now()
      FROM chosen c
     WHERE p.id = rec.product_id
       AND (
         p.started_using_at IS DISTINCT FROM c.started_using_at
         OR p.finished_at IS DISTINCT FROM c.finished_at
       );
    v_products_sync := v_products_sync + 1;
  END LOOP;

  FOR rec IN
    SELECT pa.id
      FROM public.package_appointments pa
      JOIN public.service_packages sp ON sp.id = pa.package_id
     WHERE sp.is_active = true
       AND pa.status NOT IN ('completed', 'missed', 'cancelled', 'rescheduled')
     ORDER BY pa.package_id, COALESCE(pa.sequence_order, pa.session_number)
  LOOP
    BEGIN
      PERFORM public.recalculate_package_minimum_intervals(rec.id);
      v_pkg_recalc := v_pkg_recalc + 1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'appointments_payment_status_fixed', v_appts_payment,
    'appointments_amount_paid_fixed', v_appts_amount,
    'single_sales_final_amount_fixed', v_sales_final,
    'package_original_session_fixed', v_pkg_orig,
    'products_resynced', v_products_sync,
    'packages_recalculated', v_pkg_recalc,
    'executed_at', now()
  );
END;
$$;

-- Correção pontual: para produtos com uma compra ativa (sem finished_at),
-- alinha products.started_using_at com a compra ativa mais recente.
WITH active AS (
  SELECT DISTINCT ON (product_id) product_id, started_using_at
    FROM public.product_purchases
   WHERE started_using_at IS NOT NULL AND finished_at IS NULL
   ORDER BY product_id, started_using_at DESC, created_at DESC
)
UPDATE public.products p
   SET started_using_at = a.started_using_at,
       finished_at = NULL,
       updated_at = now()
  FROM active a
 WHERE p.id = a.product_id
   AND (p.started_using_at IS DISTINCT FROM a.started_using_at
        OR p.finished_at IS NOT NULL);