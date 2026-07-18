CREATE OR REPLACE FUNCTION public.decrease_product_stock_on_appointment_complete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _pkg_id uuid;
  _template_id uuid;
  _step_service_id uuid;
  _became_completed boolean;
  _left_completed boolean;
  _prof_id uuid;
  _owner uuid := NEW.account_owner_id;
  _today date := (NEW.start_time AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  _became_completed := (NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status <> 'completed'));
  _left_completed   := (TG_OP = 'UPDATE' AND OLD.status = 'completed' AND NEW.status <> 'completed');
  _prof_id := NEW.professional_id;

  IF _left_completed THEN
    UPDATE public.products p
       SET current_stock = current_stock + apc.quantity_used, updated_at = now()
      FROM public.appointment_product_consumption apc
     WHERE apc.appointment_id = NEW.id AND apc.product_id = p.id;
    DELETE FROM public.appointment_product_consumption WHERE appointment_id = NEW.id;
    DELETE FROM public.product_daily_consumption
     WHERE appointment_id = NEW.id AND notes LIKE 'Baixa automática por atendimento concluído%';
    RETURN NEW;
  END IF;

  IF NOT _became_completed THEN RETURN NEW; END IF;

  SELECT pa.package_id, pa.service_id INTO _pkg_id, _step_service_id
    FROM public.package_appointments pa WHERE pa.appointment_id = NEW.id LIMIT 1;

  IF _pkg_id IS NOT NULL THEN
    SELECT sp.template_id INTO _template_id FROM public.service_packages sp WHERE sp.id = _pkg_id;
  END IF;

  WITH links AS (
    SELECT 'service'::text AS source_type, sp.service_id AS source_id, sp.product_id,
           sp.quantity_per_use, COALESCE(sp.tracking_method,'exact') AS tracking_method,
           sp.container_amount, sp.container_unit, sp.estimated_appointments
      FROM public.service_products sp
     WHERE NEW.service_id IS NOT NULL AND sp.service_id = NEW.service_id
    UNION ALL
    SELECT 'service', sp.service_id, sp.product_id, sp.quantity_per_use,
           COALESCE(sp.tracking_method,'exact'), sp.container_amount, sp.container_unit, sp.estimated_appointments
      FROM public.service_products sp
     WHERE _step_service_id IS NOT NULL AND sp.service_id = _step_service_id
       AND (NEW.service_id IS NULL OR sp.service_id <> NEW.service_id)
    UNION ALL
    SELECT 'package_template', ptp.template_id, ptp.product_id, ptp.quantity_per_use,
           COALESCE(ptp.tracking_method,'exact'), ptp.container_amount, ptp.container_unit, ptp.estimated_appointments
      FROM public.package_template_products ptp
     WHERE _template_id IS NOT NULL AND ptp.template_id = _template_id
  ),
  computed AS (
    SELECT l.product_id, l.source_type, l.source_id,
      CASE
        WHEN l.tracking_method = 'estimated'
             AND COALESCE(l.container_amount,0) > 0
             AND COALESCE(l.estimated_appointments,0) > 0
        THEN public.convert_product_quantity(COALESCE(l.container_amount,0), COALESCE(l.container_unit, p.unit), p.unit)
             / NULLIF(l.estimated_appointments,0)
        WHEN l.tracking_method = 'estimated'
             AND COALESCE(l.quantity_per_use,0) = 0
             AND COALESCE(l.container_amount,0) > 0
        THEN public.convert_product_quantity(COALESCE(l.container_amount,0), COALESCE(l.container_unit, p.unit), p.unit)
        ELSE COALESCE(l.quantity_per_use, 0)
      END AS qty,
      row_number() OVER (PARTITION BY l.product_id ORDER BY l.source_type) AS rn
    FROM links l JOIN public.products p ON p.id = l.product_id
  ),
  agg AS (
    SELECT product_id,
           SUM(qty) AS total_qty,
           MAX(CASE WHEN rn = 1 THEN source_type END) AS source_type,
           MAX(CASE WHEN rn = 1 THEN source_id::text END)::uuid AS source_id
      FROM computed
     GROUP BY product_id
  )
  INSERT INTO public.appointment_product_consumption
    (appointment_id, product_id, quantity_used, source_type, source_id, account_owner_id)
  SELECT NEW.id, a.product_id, a.total_qty, a.source_type, a.source_id, _owner
    FROM agg a WHERE a.total_qty > 0
  ON CONFLICT (appointment_id, product_id) DO NOTHING;

  UPDATE public.products p
     SET current_stock = GREATEST(0, current_stock - agg.total_qty), updated_at = now()
    FROM (
      SELECT product_id, SUM(quantity_used) AS total_qty
        FROM public.appointment_product_consumption
       WHERE appointment_id = NEW.id GROUP BY product_id
    ) agg WHERE agg.product_id = p.id;

  INSERT INTO public.product_daily_consumption
    (product_id, consumption_date, quantity_used, unit, professional_id, service_id, appointment_id, notes, account_owner_id)
  SELECT apc.product_id, _today, apc.quantity_used, p.unit, _prof_id, NEW.service_id, NEW.id,
         'Baixa automática por atendimento concluído (source:' || apc.source_type || ')', _owner
    FROM public.appointment_product_consumption apc
    JOIN public.products p ON p.id = apc.product_id
   WHERE apc.appointment_id = NEW.id
     AND NOT EXISTS (SELECT 1 FROM public.product_daily_consumption pdc
                      WHERE pdc.appointment_id = NEW.id AND pdc.product_id = apc.product_id);
  RETURN NEW;
END;
$function$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT a.id FROM public.appointments a
     WHERE a.status = 'completed'
       AND NOT EXISTS (SELECT 1 FROM public.appointment_product_consumption apc WHERE apc.appointment_id = a.id)
       AND (
         (a.service_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.service_products sp WHERE sp.service_id = a.service_id))
         OR EXISTS (
           SELECT 1 FROM public.package_appointments pa
             JOIN public.service_packages spk ON spk.id = pa.package_id
             JOIN public.package_template_products ptp ON ptp.template_id = spk.template_id
            WHERE pa.appointment_id = a.id)
       )
  LOOP
    UPDATE public.appointments SET status = 'scheduled' WHERE id = r.id;
    UPDATE public.appointments SET status = 'completed' WHERE id = r.id;
  END LOOP;
END $$;