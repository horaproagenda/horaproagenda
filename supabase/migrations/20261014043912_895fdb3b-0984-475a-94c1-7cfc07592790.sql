ALTER TABLE public.single_sales ADD COLUMN IF NOT EXISTS batch_request_id uuid, ADD COLUMN IF NOT EXISTS batch_payload jsonb;
CREATE INDEX single_sales_batch_request ON public.single_sales(created_by,batch_request_id) WHERE batch_request_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.create_multi_item_sale_atomic(_input jsonb,_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
 u uuid:=auth.uid(); owner uuid; client uuid; method public.payment_methods%rowtype; brand public.card_brands%rowtype;
 cl public.clients%rowtype; items jsonb; item jsonb; source_id uuid; kind text; qty integer; price numeric; name text; prof uuid;
 subtotal numeric:=0; discount numeric; base numeric; fee numeric:=0; rate numeric:=0; total numeric; amount numeric; remainder numeric;
 n integer; date_of_sale date; deferred boolean; credit boolean; cash boolean; received numeric; change numeric; change_kind text;
 result jsonb; stored jsonb; sale_id uuid; pkg uuid; tpl public.package_templates%rowtype; dest record; first_dest uuid; first_prof uuid; dest_set boolean:=false;
 item_number integer:=0; item_original numeric; item_discount numeric; item_final numeric; item_fee numeric; allocated numeric:=0; allocated_discount numeric:=0; allocated_fee numeric:=0;
 count_sessions integer; step record; i integer; j integer; due date; due_first date; count_payments integer; part numeric; part_remainder numeric;
 link record; stock numeric; balance numeric; data jsonb; created_ids uuid[]:=ARRAY[]::uuid[]; sold_services uuid[]; stockqty numeric;
BEGIN
 IF u IS NULL OR _request_id IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para registrar a venda.' USING ERRCODE='42501'; END IF;
 owner:=public.current_account_owner_id(); IF owner IS NULL THEN RAISE EXCEPTION 'Conta não disponível.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('basket:'||u::text||_request_id::text,0));
 SELECT batch_payload INTO stored FROM public.single_sales WHERE created_by=u AND batch_request_id=_request_id LIMIT 1;
 IF FOUND THEN
 IF stored IS DISTINCT FROM _input THEN RAISE EXCEPTION 'Esta solicitação já foi usada com outros dados. Confira a venda antes de tentar novamente.'; END IF;
 SELECT jsonb_agg(to_jsonb(s) - 'batch_payload' ORDER BY created_at,id) INTO result FROM public.single_sales s WHERE created_by=u AND batch_request_id=_request_id;
 RETURN jsonb_build_object('sales',result,'replayed',true); END IF;
 client:=nullif(_input->>'client_id','')::uuid;
 SELECT * INTO cl FROM public.clients WHERE id=client AND account_owner_id=owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não disponível.' USING ERRCODE='42501'; END IF;
 SELECT * INTO method FROM public.payment_methods WHERE id=nullif(_input->>'payment_method_id','')::uuid AND account_owner_id=owner AND is_active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Escolha uma forma de pagamento disponível.'; END IF;
 items:=_input->'items';
 IF jsonb_typeof(items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Adicione itens à venda.'; END IF;
 n:=jsonb_array_length(items); IF n<1 OR n>100 THEN RAISE EXCEPTION 'Confira os itens da venda.'; END IF;
 date_of_sale:=(_input->>'sale_date')::date; IF date_of_sale IS NULL THEN RAISE EXCEPTION 'Informe a data da venda.'; END IF;
 credit:=lower(translate(method.name,'éÉíÍ','eEiI')) LIKE '%credito ao cliente%' OR lower(method.name) LIKE '%credit to client%';
 deferred:=lower(method.name) LIKE '%boleto%' OR lower(method.name) LIKE '%cheque%'; cash:=lower(method.name) LIKE '%dinheiro%';
 count_payments:=coalesce((_input->>'installments')::integer,1);
 IF count_payments<1 OR count_payments>coalesce(method.max_installments,100) THEN RAISE EXCEPTION 'Confira a quantidade de parcelas permitida.'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
 kind:=item->>'type'; source_id:=(item->>'source_id')::uuid; qty:=(item->>'quantity')::integer;
 IF qty IS NULL OR qty<1 OR qty>1000 THEN RAISE EXCEPTION 'Informe uma quantidade inteira positiva.'; END IF;
 IF kind='service' THEN SELECT s.price,s.name,s.professional_id INTO price,name,prof FROM public.services s WHERE s.id=source_id AND s.account_owner_id=owner AND s.is_active;
 ELSIF kind='package' THEN SELECT t.price,t.name,t.professional_id INTO price,name,prof FROM public.package_templates t WHERE t.id=source_id AND t.account_owner_id=owner AND t.is_active;
 ELSIF kind='product' THEN SELECT p.sale_price,p.name,p.owner_professional_id INTO price,name,prof FROM public.products p WHERE p.id=source_id AND p.account_owner_id=owner AND p.is_active AND p.is_for_sale;
 ELSE RAISE EXCEPTION 'Tipo de item inválido.'; END IF;
 IF NOT FOUND OR price IS NULL OR price<0 OR price::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Item ou preço não disponível. Confira o cadastro.'; END IF;
 IF nullif(item->>'professional_id','') IS NOT NULL THEN
 IF NOT EXISTS(SELECT 1 FROM public.professionals WHERE id=(item->>'professional_id')::uuid AND account_owner_id=owner AND is_active) THEN RAISE EXCEPTION 'Profissional não disponível.'; END IF;
 prof:=(item->>'professional_id')::uuid; END IF;
 IF kind='package' AND prof IS NULL THEN RAISE EXCEPTION 'Atribua um profissional ao pacote.'; END IF;
 subtotal:=subtotal+round(price*qty,2);
 END LOOP;
 discount:=coalesce((_input->>'discount_amount')::numeric,0);
 IF discount<0 OR discount>=subtotal OR discount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Confira o desconto da venda.'; END IF;
 base:=round(subtotal-discount,2);
 IF nullif(_input->>'card_brand_id','') IS NOT NULL THEN
 SELECT * INTO brand FROM public.card_brands WHERE id=(_input->>'card_brand_id')::uuid AND account_owner_id=owner AND is_active;
 IF NOT FOUND OR (lower(method.name) NOT LIKE '%cart%' AND lower(method.name) NOT LIKE '%card%') THEN RAISE EXCEPTION 'Bandeira não disponível para esta forma de pagamento.'; END IF;
 SELECT fee_percentage INTO rate FROM public.card_brand_fees WHERE card_brand_id=brand.id AND installment_number<=CASE WHEN brand.type='debit' THEN 1 ELSE count_payments END ORDER BY installment_number DESC LIMIT 1;
 rate:=coalesce(rate,0); IF rate<0 OR rate>=100 OR rate::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Confira a taxa cadastrada.'; END IF;
 fee:=round(base*rate/100,2); END IF;
 total:=base+CASE WHEN brand.fee_behavior='add_to_client' THEN fee ELSE 0 END;
 amount:=(_input->>'payment_amount')::numeric;
 IF amount IS NULL OR amount IS DISTINCT FROM total THEN RAISE EXCEPTION 'Os valores foram atualizados. Confira o total e a forma de pagamento antes de concluir.'; END IF;
 IF credit AND coalesce(cl.credit_balance,0)<total THEN RAISE EXCEPTION 'Saldo de crédito insuficiente.'; END IF;
 change_kind:=coalesce(_input->>'change_method','cash'); received:=coalesce((_input->>'cash_received')::numeric,0);
 IF received::text IN ('NaN','Infinity','-Infinity') OR received<0 THEN RAISE EXCEPTION 'Informe um valor recebido válido.'; END IF;
 IF cash AND received>0 AND received<total THEN RAISE EXCEPTION 'O valor recebido é menor que o total.'; END IF;
 change:=CASE WHEN cash THEN greatest(received-total,0) ELSE 0 END;
 IF change_kind NOT IN ('cash','pix','credit') THEN RAISE EXCEPTION 'Escolha como devolver o troco.'; END IF;
 IF deferred THEN
 due_first:=CASE WHEN lower(method.name) LIKE '%boleto%' THEN (_input->>'boleto_first_due_date')::date ELSE (_input->>'cheque_cash_date')::date END;
 IF due_first IS NULL THEN RAISE EXCEPTION 'Informe o vencimento.'; END IF;
 count_payments:=CASE WHEN lower(method.name) LIKE '%boleto%' THEN coalesce((_input->>'boleto_installments')::integer,1) ELSE 1 END;
 IF count_payments<1 OR count_payments>100 THEN RAISE EXCEPTION 'Confira as parcelas do boleto.'; END IF; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
 item_number:=item_number+1; source_id:=(item->>'source_id')::uuid; kind:=item->>'type'; qty:=(item->>'quantity')::integer; pkg:=NULL; sold_services:=ARRAY[]::uuid[];
 IF kind='service' THEN SELECT s.price,s.name,s.professional_id INTO price,name,prof FROM public.services s WHERE s.id=source_id AND s.account_owner_id=owner FOR SHARE;
 ELSIF kind='package' THEN SELECT * INTO tpl FROM public.package_templates WHERE id=source_id AND account_owner_id=owner FOR SHARE; price:=tpl.price; name:=tpl.name; prof:=tpl.professional_id;
 ELSE SELECT p.sale_price,p.name,p.owner_professional_id INTO price,name,prof FROM public.products p WHERE p.id=source_id AND p.account_owner_id=owner FOR UPDATE; END IF;
 prof:=coalesce(nullif(item->>'professional_id','')::uuid,prof);
 SELECT * INTO dest FROM public.resolve_financial_destination(prof);
 IF NOT deferred AND NOT credit AND dest.cash_register_id IS NULL THEN RAISE EXCEPTION 'Abra o caixa responsável por esta venda.'; END IF;
 IF NOT dest_set THEN first_dest:=dest.cash_register_id; first_prof:=dest.professional_id; dest_set:=true;
 ELSIF change>0 AND dest.cash_register_id IS DISTINCT FROM first_dest THEN RAISE EXCEPTION 'Vendas com troco precisam usar o mesmo caixa. Separe os itens por responsável.'; END IF;
 item_original:=round(price*qty,2);
 item_discount:=CASE WHEN item_number=n THEN discount-allocated_discount ELSE round(discount*item_original/subtotal,2) END;
 item_fee:=CASE WHEN item_number=n THEN fee-allocated_fee ELSE round(fee*item_original/subtotal,2) END;
 item_final:=item_original-item_discount+CASE WHEN brand.fee_behavior='add_to_client' THEN item_fee ELSE 0 END;
 allocated_discount:=allocated_discount+item_discount; allocated_fee:=allocated_fee+item_fee;
 IF item_final<=0 THEN RAISE EXCEPTION 'Confira os itens sem valor ou o desconto aplicado.'; END IF;
 IF kind='package' THEN
 -- One sold package per quantity, with each package linked to its own sale and ledger.
 FOR j IN 1..qty LOOP
 SELECT count(*) INTO count_sessions FROM public.package_template_steps WHERE template_id=tpl.id;
 IF tpl.package_type<>'sequential' OR count_sessions=0 THEN count_sessions:=tpl.total_sessions; END IF;
 IF coalesce(count_sessions,0)<1 THEN RAISE EXCEPTION 'Confira as sessões do pacote.'; END IF;
 part:=CASE WHEN j=qty THEN item_final-round(item_final/qty,2)*(qty-1) ELSE round(item_final/qty,2) END;
 INSERT INTO public.service_packages(name,description,client_id,template_id,total_sessions,duration,interval_days,total_price,package_type,professional_id,room_id,equipment,payment_methods,payment_type,sessions_scheduled,is_active,category,account_owner_id)
 VALUES(tpl.name,tpl.description,client,tpl.id,count_sessions,tpl.duration,tpl.interval_days,part,tpl.package_type,prof,tpl.room_id,tpl.equipment,ARRAY[method.id::text],'full',0,true,tpl.category,owner) RETURNING id INTO pkg;
 IF tpl.package_type='sequential' AND EXISTS(SELECT 1 FROM public.package_template_steps WHERE template_id=tpl.id) THEN
 i:=0; FOR step IN SELECT * FROM public.package_template_steps WHERE template_id=tpl.id ORDER BY sequence_order LOOP
 i:=i+1; INSERT INTO public.package_appointments(package_id,service_id,session_number,original_session_number,sequence_order,interval_after_days,status,account_owner_id)
 VALUES(pkg,step.service_id,i,i,i,CASE WHEN i=count_sessions THEN 0 ELSE step.interval_after_days END,'pending',owner); END LOOP;
 ELSE INSERT INTO public.package_appointments(package_id,session_number,original_session_number,sequence_order,interval_after_days,status,account_owner_id)
 SELECT pkg,k,k,k,CASE WHEN k=count_sessions THEN 0 ELSE tpl.interval_days END,'pending',owner FROM generate_series(1,count_sessions) k; END IF;
 INSERT INTO public.single_sales(client_id,package_id,item_type,description,original_amount,discount_amount,final_amount,payment_method_id,sale_date,notes,created_by,paid_by,paid_at,installments,card_fee_amount,account_owner_id,sale_committed,batch_request_id,batch_payload)
 VALUES(client,pkg,kind,name,CASE WHEN j=qty THEN item_original-round(item_original/qty,2)*(qty-1) ELSE round(item_original/qty,2) END,CASE WHEN j=qty THEN item_discount-round(item_discount/qty,2)*(qty-1) ELSE round(item_discount/qty,2) END,part,method.id,date_of_sale,'Venda com vários itens',u,CASE WHEN deferred THEN NULL ELSE u END,CASE WHEN deferred THEN NULL ELSE now() END,count_payments,CASE WHEN j=qty THEN item_fee-round(item_fee/qty,2)*(qty-1) ELSE round(item_fee/qty,2) END,owner,true,_request_id,_input) RETURNING id INTO sale_id;
 created_ids:=array_append(created_ids,sale_id);
 END LOOP;
 ELSE
 INSERT INTO public.single_sales(client_id,service_id,item_type,description,original_amount,discount_amount,final_amount,payment_method_id,sale_date,notes,created_by,paid_by,paid_at,installments,card_fee_amount,account_owner_id,sale_committed,batch_request_id,batch_payload)
 VALUES(client,CASE WHEN kind='service' THEN source_id ELSE NULL END,kind,name,item_original,item_discount,item_final,method.id,date_of_sale,'Venda com vários itens - Qtd: '||qty,u,CASE WHEN deferred THEN NULL ELSE u END,CASE WHEN deferred THEN NULL ELSE now() END,count_payments,item_fee,owner,true,_request_id,_input) RETURNING id INTO sale_id;
 created_ids:=array_append(created_ids,sale_id);
 IF kind='service' THEN INSERT INTO public.client_services(client_id,service_id,sale_id,amount_paid,status,created_by,account_owner_id)
 SELECT client,source_id,sale_id,CASE WHEN deferred THEN 0 ELSE item_final/qty END,'available',u,owner FROM generate_series(1,qty); END IF;
 END IF;
 -- Ledger for each sale is linked by sale_id, including package quantity greater than one.
 FOR data IN SELECT to_jsonb(s) FROM public.single_sales s WHERE s.id=ANY(created_ids) AND NOT EXISTS(SELECT 1 FROM public.financial_entries f WHERE f.sale_id=s.id) LOOP
 IF credit THEN CONTINUE; END IF;
 IF (data->>'item_type')<>kind OR (data->>'description')<>name THEN CONTINUE; END IF;
 IF deferred THEN
 part:=trunc((data->>'final_amount')::numeric/count_payments,2); part_remainder:=(data->>'final_amount')::numeric-part*count_payments;
 FOR i IN 1..count_payments LOOP
 due:=due_first+(i-1)*30; amount:=part+CASE WHEN i=count_payments THEN part_remainder ELSE 0 END;
 INSERT INTO public.financial_entries(type,description,amount,due_date,status,payment_method_id,client_id,created_by,sale_id,professional_id,account_owner_id,installments)
 VALUES('receivable',method.name||' '||i||'/'||count_payments||': '||name,amount,due,'pending',method.id,client,u,(data->>'id')::uuid,dest.professional_id,owner,count_payments);
 IF lower(method.name) LIKE '%boleto%' THEN INSERT INTO public.boleto_installments(sale_id,installment_number,total_installments,amount,due_date,status,created_by,account_owner_id)
 VALUES((data->>'id')::uuid,i,count_payments,amount,due,'pending',u,owner); END IF;
 INSERT INTO public.reminders(title,description,reminder_date,reminder_time,is_recurring,is_active,is_completed,category,priority,created_by,account_owner_id)
 VALUES('Verificar '||method.name||': '||cl.name,'Parcela '||i||'/'||count_payments||' de '||name,due,'09:00',false,true,false,'financeiro','high',u,owner);
 END LOOP;
 ELSE
 INSERT INTO public.financial_entries(type,description,amount,due_date,paid_date,status,payment_method_id,client_id,created_by,paid_by,sale_id,professional_id,account_owner_id)
 VALUES('receivable','Venda: '||name,(data->>'final_amount')::numeric,date_of_sale,date_of_sale,'paid',method.id,client,u,u,(data->>'id')::uuid,dest.professional_id,owner);
 INSERT INTO public.cash_transactions(cash_register_id,type,category,description,amount,payment_method,reference_id,reference_type,created_by,professional_id,account_owner_id,card_fee_amount,installments)
 VALUES(dest.cash_register_id,'income','sale','Venda: '||name,(data->>'final_amount')::numeric,method.name,(data->>'id')::uuid,'single_sale',u,dest.professional_id,owner,(data->>'card_fee_amount')::numeric,count_payments);
 IF brand.fee_behavior='deduct_from_provider' AND (data->>'card_fee_amount')::numeric>0 THEN
 INSERT INTO public.financial_entries(type,description,amount,due_date,paid_date,status,payment_method_id,created_by,sale_id,professional_id,account_owner_id)
 VALUES('expense','Taxa de cartão: '||name,(data->>'card_fee_amount')::numeric,date_of_sale,date_of_sale,'paid',method.id,u,(data->>'id')::uuid,dest.professional_id,owner); END IF;
 END IF;
 END LOOP;
 IF kind='product' THEN
 SELECT current_stock INTO stock FROM public.products WHERE id=source_id FOR UPDATE;
 SELECT coalesce(sum(stock_quantity),0) INTO stockqty FROM public.product_usage_records WHERE product_id=source_id AND status IN ('planned','in_use');
 IF stock-stockqty<qty THEN RAISE EXCEPTION 'Estoque disponível insuficiente para concluir a venda.'; END IF;
 PERFORM public.adjust_product_stock(source_id,-qty);
 INSERT INTO public.product_daily_consumption(product_id,consumption_date,quantity_used,unit,professional_id,notes,created_by,account_owner_id)
 SELECT source_id,date_of_sale,qty,p.unit,dest.professional_id,'Baixa automática por venda no caixa (sale:'||sale_id::text||')',u,owner FROM public.products p WHERE p.id=source_id;
 ELSE
 FOR link IN
 WITH ss AS (SELECT source_id service_id,qty::numeric multiplier WHERE kind='service' UNION ALL SELECT pa.service_id,count(*)::numeric FROM public.package_appointments pa JOIN public.single_sales s ON s.package_id=pa.package_id WHERE s.id=ANY(created_ids) AND s.batch_request_id=_request_id AND s.item_type='package' AND s.description=name GROUP BY pa.service_id)
 SELECT sp.product_id,p.unit,min(sp.service_id::text)::uuid service_id,sum(public.convert_product_quantity(sp.quantity_per_use,coalesce(sp.container_unit,p.unit),p.unit)*ss.multiplier) quantity
 FROM ss JOIN public.service_products sp ON sp.service_id=ss.service_id JOIN public.products p ON p.id=sp.product_id
 WHERE sp.account_owner_id=owner AND p.account_owner_id=owner AND sp.quantity_per_use>0 AND coalesce(sp.tracking_method,'exact') NOT IN ('estimated','estimado') AND NOT EXISTS(SELECT 1 FROM public.product_usage_records r WHERE r.product_id=p.id AND r.status='in_use') GROUP BY sp.product_id,p.unit ORDER BY sp.product_id
 LOOP
 IF link.quantity IS NULL THEN RAISE EXCEPTION 'Confira a unidade do produto vinculado.'; END IF;
 SELECT current_stock INTO stock FROM public.products WHERE id=link.product_id FOR UPDATE;
 IF stock<link.quantity THEN RAISE EXCEPTION 'Estoque insuficiente para concluir a venda.'; END IF;
 PERFORM public.adjust_product_stock(link.product_id,-link.quantity);
 INSERT INTO public.product_daily_consumption(product_id,consumption_date,quantity_used,unit,professional_id,service_id,notes,created_by,account_owner_id)
 VALUES(link.product_id,date_of_sale,link.quantity,link.unit,dest.professional_id,link.service_id,'Baixa automática por venda no caixa (sale:'||sale_id::text||')',u,owner);
 END LOOP;
 END IF;
 END LOOP;
 IF credit OR (change>0 AND change_kind='credit') THEN
 balance:=coalesce(cl.credit_balance,0); amount:=CASE WHEN credit THEN -total ELSE change END;
 UPDATE public.clients SET credit_balance=balance+amount WHERE id=client;
 INSERT INTO public.client_credit_transactions(client_id,sale_id,transaction_type,amount,previous_balance,new_balance,description,created_by,account_owner_id)
 VALUES(client,created_ids[1],CASE WHEN credit THEN 'credit_used' ELSE 'credit_added' END,abs(amount),balance,balance+amount,'Venda com vários itens',u,owner);
 END IF;
 IF change>0 AND change_kind IN ('cash','pix') THEN
 -- Cash received above sale total plus matching outgoing change leaves net receipt equal to total.
 INSERT INTO public.cash_transactions(cash_register_id,type,category,description,amount,payment_method,reference_id,reference_type,created_by,professional_id,account_owner_id)
 VALUES(first_dest,'income','cash_received_extra','Valor recebido para troco',change,method.name,created_ids[1],'single_sale',u,first_prof,owner);
 INSERT INTO public.cash_transactions(cash_register_id,type,category,description,amount,payment_method,reference_id,reference_type,created_by,professional_id,account_owner_id)
 VALUES(first_dest,'expense','change','Troco',change,CASE WHEN change_kind='pix' THEN 'PIX' ELSE 'Dinheiro' END,created_ids[1],'single_sale',u,first_prof,owner);
 ELSIF change>0 AND change_kind='credit' THEN
 INSERT INTO public.cash_transactions(cash_register_id,type,category,description,amount,payment_method,reference_id,reference_type,created_by,professional_id,account_owner_id)
 VALUES(first_dest,'income','client_credit','Troco deixado como crédito',change,method.name,created_ids[1],'single_sale',u,first_prof,owner); END IF;
 SELECT sum(final_amount) INTO amount FROM public.single_sales WHERE id=ANY(created_ids);
 IF amount IS DISTINCT FROM total THEN RAISE EXCEPTION 'Os preços mudaram durante a venda. Confira o total antes de concluir.'; END IF;
 SELECT jsonb_agg(to_jsonb(s)-'batch_payload' ORDER BY created_at,id) INTO result FROM public.single_sales s WHERE id=ANY(created_ids);
 RETURN jsonb_build_object('sales',result,'total',total,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.create_multi_item_sale_atomic(jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_multi_item_sale_atomic(jsonb,uuid) TO authenticated,service_role;
