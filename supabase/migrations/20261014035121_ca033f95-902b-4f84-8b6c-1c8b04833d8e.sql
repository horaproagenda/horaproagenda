REVOKE ALL ON public.product_usage_events FROM anon;
CREATE OR REPLACE FUNCTION public.recalculate_product_cycles() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.products p SET started_using_at=CASE WHEN u.status='cancelled' THEN NULL ELSE u.start_date END,finished_at=CASE WHEN u.status='completed' THEN u.end_date ELSE NULL END,cycle_quantity=CASE WHEN u.status='in_use' THEN u.stock_quantity ELSE NULL END,cycle_unit=CASE WHEN u.status='in_use' THEN u.container_unit ELSE NULL END
 FROM (SELECT DISTINCT ON(product_id) * FROM public.product_usage_records ORDER BY product_id, CASE WHEN status='in_use' THEN 0 ELSE 1 END,updated_at DESC) u WHERE p.id=u.product_id AND (p.started_using_at IS DISTINCT FROM (CASE WHEN u.status='cancelled' THEN NULL ELSE u.start_date END) OR p.finished_at IS DISTINCT FROM (CASE WHEN u.status='completed' THEN u.end_date ELSE NULL END));
END $$;
CREATE OR REPLACE FUNCTION public.record_completed_product_usage(_product_id uuid,_quantity numeric,_unit text,_start_date date,_end_date date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r jsonb; BEGIN
 r:=public.start_product_usage_cycle(_product_id,_start_date,_quantity,_unit,NULL);
 RETURN public.finish_product_usage_record((r->>'id')::uuid,_end_date,(r->>'version')::integer);
END $$;
REVOKE ALL ON FUNCTION public.record_completed_product_usage(uuid,numeric,text,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_completed_product_usage(uuid,numeric,text,date,date) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.recalculate_product_cycles() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_product_cycles() TO service_role;