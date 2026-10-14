DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.create_multi_item_sale_atomic(jsonb,uuid)'::regprocedure) INTO d;
 d:=replace(d,'sold_services uuid[]; stockqty numeric;','sold_services uuid[]; stockqty numeric; item_ids uuid[]; stock_sale uuid;');
 d:=replace(d,'item_number:=item_number+1; source_id','item_ids:=ARRAY[]::uuid[]; item_number:=item_number+1; source_id');
 d:=replace(d,'created_ids:=array_append(created_ids,sale_id);','created_ids:=array_append(created_ids,sale_id); item_ids:=array_append(item_ids,sale_id);');
 d:=replace(d,'WHERE s.id=ANY(created_ids) AND NOT EXISTS','WHERE s.id=ANY(item_ids) AND NOT EXISTS');
 d:=replace(d,$s$WHERE s.id=ANY(created_ids) AND s.batch_request_id=_request_id AND s.item_type='package' AND s.description=name$s$, $s$WHERE s.id=ANY(item_ids) AND s.batch_request_id=_request_id AND s.item_type='package'$s$);
 d:=replace(d,'p.unit)*ss.multiplier) quantity','p.unit)*ss.multiplier) quantity, bool_or(public.convert_product_quantity(sp.quantity_per_use,coalesce(sp.container_unit,p.unit),p.unit) IS NULL) incompatible');
 d:=replace(d,'IF link.quantity IS NULL THEN', 'IF link.quantity IS NULL OR link.incompatible THEN');
 d:=replace(d,'IF stock<link.quantity THEN', $s$SELECT coalesce(sum(stock_quantity),0) INTO stockqty FROM public.product_usage_records WHERE product_id=link.product_id AND status IN ('planned','in_use'); IF stock-stockqty<link.quantity THEN$s$);
 d:=replace(d,$s$INSERT INTO public.product_daily_consumption(product_id,consumption_date,quantity_used,unit,professional_id,service_id,notes,created_by,account_owner_id)
 VALUES(link.product_id,date_of_sale,link.quantity,link.unit,dest.professional_id,link.service_id,'Baixa automática por venda no caixa (sale:'||sale_id::text||')',u,owner);$s$, $s$FOREACH stock_sale IN ARRAY item_ids LOOP
 INSERT INTO public.product_daily_consumption(product_id,consumption_date,quantity_used,unit,professional_id,service_id,notes,created_by,account_owner_id)
 VALUES(link.product_id,date_of_sale,link.quantity/cardinality(item_ids),link.unit,dest.professional_id,link.service_id,'Baixa automática por venda no caixa (sale:'||stock_sale::text||')',u,owner);
 END LOOP;$s$);
 EXECUTE d;
END $$;