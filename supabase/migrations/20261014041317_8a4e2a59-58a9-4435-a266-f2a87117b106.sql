-- Rollback: restore the preceding definitions of create_single_sale_atomic and decrease_product_stock_on_appointment_complete.
DO $migration$
DECLARE v_definition text;
BEGIN
 SELECT pg_get_functiondef('public.create_single_sale_atomic(jsonb,uuid)'::regprocedure) INTO v_definition;
 v_definition:=replace(v_definition,'SELECT * INTO v_destination FROM public.resolve_financial_destination();','SELECT * INTO v_destination FROM public.resolve_financial_destination((SELECT professional_id FROM public.services WHERE id=v_service));');
 EXECUTE v_definition;
 SELECT pg_get_functiondef('public.decrease_product_stock_on_appointment_complete()'::regprocedure) INTO v_definition;
 v_definition:=replace(v_definition, 'WHEN l.tracking_method = ''estimated'' OR EXISTS', E'WHEN EXISTS (\n SELECT 1 FROM public.product_daily_consumption pdc\n WHERE pdc.product_id=l.product_id AND EXISTS (\n   SELECT 1 FROM public.single_sales ss\n   WHERE pdc.notes LIKE \'%sale:\'||ss.id::text||\'%\'\n   AND (ss.package_id=_pkg_id OR ss.id IN (SELECT cs.sale_id FROM public.client_services cs WHERE cs.appointment_id=NEW.id))\n )\n) OR l.tracking_method = \'estimated\' OR EXISTS');
 EXECUTE v_definition;
END; $migration$;