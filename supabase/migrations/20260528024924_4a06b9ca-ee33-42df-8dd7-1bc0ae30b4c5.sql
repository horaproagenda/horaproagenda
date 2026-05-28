-- Tracker table for data healing migrations
CREATE TABLE IF NOT EXISTS public.app_data_migrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  migration_key TEXT NOT NULL UNIQUE,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_by UUID,
  details JSONB DEFAULT '{}'::jsonb
);

GRANT SELECT, INSERT ON public.app_data_migrations TO authenticated;
GRANT ALL ON public.app_data_migrations TO service_role;

ALTER TABLE public.app_data_migrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read data migrations"
  ON public.app_data_migrations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins insert data migrations"
  ON public.app_data_migrations FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Record helper
CREATE OR REPLACE FUNCTION public.record_data_migration(p_key TEXT, p_details JSONB DEFAULT '{}'::jsonb)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem registrar migrações de dados.';
  END IF;
  INSERT INTO public.app_data_migrations(migration_key, executed_by, details)
  VALUES (p_key, auth.uid(), COALESCE(p_details, '{}'::jsonb))
  ON CONFLICT (migration_key) DO NOTHING;
  RETURN FOUND;
END;
$$;

-- Main heal function: idempotent normalization of legacy data
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

  -- 1. Appointments: payment_status null -> 'pending'
  UPDATE public.appointments
     SET payment_status = 'pending', updated_at = now()
   WHERE payment_status IS NULL;
  GET DIAGNOSTICS v_appts_payment = ROW_COUNT;

  -- 2. Appointments: amount_paid null -> 0
  UPDATE public.appointments
     SET amount_paid = 0, updated_at = now()
   WHERE amount_paid IS NULL;
  GET DIAGNOSTICS v_appts_amount = ROW_COUNT;

  -- 3. Single sales: final_amount null -> recalc
  UPDATE public.single_sales
     SET final_amount = GREATEST(COALESCE(original_amount, 0) - COALESCE(discount_amount, 0), 0)
   WHERE final_amount IS NULL;
  GET DIAGNOSTICS v_sales_final = ROW_COUNT;

  -- 4. Package appointments: original_session_number backfill
  UPDATE public.package_appointments
     SET original_session_number = session_number
   WHERE original_session_number IS NULL
     AND session_number IS NOT NULL;
  GET DIAGNOSTICS v_pkg_orig = ROW_COUNT;

  -- 5. Re-sync products dates from purchases (idempotent trigger-like sweep)
  FOR rec IN
    SELECT DISTINCT product_id FROM public.product_purchases
  LOOP
    UPDATE public.products p
       SET started_using_at = sub.min_start,
           finished_at = CASE WHEN sub.unfinished = 0 AND sub.started > 0 THEN sub.max_finish ELSE NULL END,
           updated_at = now()
      FROM (
        SELECT
          MIN(started_using_at) AS min_start,
          MAX(finished_at) AS max_finish,
          COUNT(*) FILTER (WHERE started_using_at IS NOT NULL AND finished_at IS NULL) AS unfinished,
          COUNT(*) FILTER (WHERE started_using_at IS NOT NULL) AS started
        FROM public.product_purchases
        WHERE product_id = rec.product_id
      ) sub
     WHERE p.id = rec.product_id
       AND (
         p.started_using_at IS DISTINCT FROM COALESCE(sub.min_start, p.started_using_at)
         OR p.finished_at IS DISTINCT FROM CASE WHEN sub.unfinished = 0 AND sub.started > 0 THEN sub.max_finish ELSE NULL END
       );
    v_products_sync := v_products_sync + 1;
  END LOOP;

  -- 6. Recalculate package intervals for active packages
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
      -- skip and continue
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

GRANT EXECUTE ON FUNCTION public.heal_legacy_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_data_migration(TEXT, JSONB) TO authenticated;