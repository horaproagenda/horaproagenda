DO $mig$
DECLARE d text;
BEGIN
 d := pg_get_functiondef('public.finish_product_usage_record'::regproc);
 d := replace(d, 'a.usage_day,base+CASE WHEN i=n THEN leftover ELSE 0 END,u.container_unit,p.owner_professional_id,a.service_id,a.id',
   'a.usage_day,base+CASE WHEN i=n THEN leftover ELSE 0 END,u.container_unit,p.owner_professional_id,CASE WHEN EXISTS(SELECT 1 FROM public.service_products WHERE product_id=p.id) OR EXISTS(SELECT 1 FROM public.package_template_products WHERE product_id=p.id) THEN a.service_id ELSE NULL END,a.id');
 IF position('ELSE NULL END,a.id' in d)=0 THEN RAISE EXCEPTION 'patch not applied'; END IF;
 EXECUTE d;
END $mig$;

WITH fixed AS (
 UPDATE public.product_daily_consumption c SET service_id=NULL
 WHERE c.service_id IS NOT NULL AND c.cancelled_at IS NULL AND c.notes='Consumo do ciclo de uso'
 AND NOT EXISTS(SELECT 1 FROM public.service_products sp WHERE sp.product_id=c.product_id)
 AND NOT EXISTS(SELECT 1 FROM public.package_template_products pt WHERE pt.product_id=c.product_id)
 RETURNING c.product_id, c.cycle_key, c.account_owner_id)
INSERT INTO public.product_usage_events(usage_id,product_id,account_owner_id,event_type,old_data,new_data,stock_delta,changed_by)
SELECT r.id, r.product_id, r.account_owner_id, 'usage_corrected',
 jsonb_build_object('service_attribution','rateio por serviço'),
 jsonb_build_object('service_attribution','uso geral','reason','Produto sem vínculo com serviços: consumo do ciclo não deve ser atribuído a serviços.'),
 0, NULL
FROM (SELECT DISTINCT product_id, cycle_key FROM fixed) f
JOIN public.product_usage_records r ON r.product_id=f.product_id AND r.cycle_key=f.cycle_key;