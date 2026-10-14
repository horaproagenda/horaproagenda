DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='decrease_product_stock_on_appointment_complete';
 IF def IS NULL THEN RAISE EXCEPTION 'Função de consumo não encontrada'; END IF;
 def:=replace(def,'WHEN l.tracking_method = ''estimated'' THEN 0','WHEN l.tracking_method = ''estimated'' OR EXISTS (SELECT 1 FROM public.product_usage_records u WHERE u.product_id=l.product_id AND (u.status=''in_use'' OR (u.status=''completed'' AND NEW.id=ANY(u.appointment_ids)))) THEN 0');
 EXECUTE def;
END $$;