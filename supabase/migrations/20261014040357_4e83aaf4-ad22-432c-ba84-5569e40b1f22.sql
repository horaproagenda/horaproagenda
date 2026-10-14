-- Rollback: remove create_single_sale_atomic(jsonb,uuid); remove single_sales_request_unique and request_id after checking usage.
ALTER TABLE public.single_sales ADD COLUMN IF NOT EXISTS request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS single_sales_request_unique ON public.single_sales(created_by,request_id) WHERE request_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.create_single_sale_atomic(_sale jsonb,_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
  v_user uuid := auth.uid(); v_owner uuid; v_sale public.single_sales%rowtype;
  v_source public.service_packages%rowtype; v_package uuid; v_service uuid;
  v_client uuid; v_method uuid; v_bank uuid; v_original numeric; v_discount numeric;
  v_final numeric; v_date date; v_type text; v_name text; v_destination record;
  v_step record; v_i integer:=0; v_count integer; v_pm_name text;
BEGIN
  IF v_user IS NULL OR _request_id IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para registrar a venda.' USING ERRCODE='42501'; END IF;
  v_owner:=public.current_account_owner_id();
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Conta não identificada.' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text||_request_id::text,0));
  SELECT * INTO v_sale FROM public.single_sales WHERE created_by=v_user AND request_id=_request_id;
  IF FOUND THEN RETURN to_jsonb(v_sale); END IF;
  v_type:=_sale->>'item_type';
  v_service:=nullif(_sale->>'service_id','')::uuid; v_package:=nullif(_sale->>'package_id','')::uuid;
  v_client:=nullif(_sale->>'client_id','')::uuid; v_method:=nullif(_sale->>'payment_method_id','')::uuid;
  v_bank:=nullif(_sale->>'bank_id','')::uuid;
  v_original:=(_sale->>'original_amount')::numeric; v_discount:=coalesce((_sale->>'discount_amount')::numeric,0);
  IF v_original IS NULL OR v_original<=0 OR v_discount<0 OR v_discount>=v_original OR v_original::text IN ('NaN','Infinity','-Infinity') OR v_discount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Confira o valor e o desconto da venda.'; END IF;
  v_final:=round(v_original-v_discount,2); v_date:=(_sale->>'sale_date')::date;
  IF v_date IS NULL THEN RAISE EXCEPTION 'Informe a data da venda.'; END IF;
  SELECT name INTO v_pm_name FROM public.payment_methods WHERE id=v_method AND account_owner_id=v_owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'Escolha uma forma de pagamento disponível.'; END IF;
  IF v_client IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.clients WHERE id=v_client AND account_owner_id=v_owner) THEN RAISE EXCEPTION 'Cliente não disponível.' USING ERRCODE='42501'; END IF;
  IF v_bank IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.banks WHERE id=v_bank AND account_owner_id=v_owner) THEN RAISE EXCEPTION 'Banco não disponível.' USING ERRCODE='42501'; END IF;
  IF v_type='service' AND v_service IS NOT NULL AND v_package IS NULL THEN
    SELECT name INTO v_name FROM public.services WHERE id=v_service AND account_owner_id=v_owner;
    IF NOT FOUND THEN RAISE EXCEPTION 'Serviço não disponível.' USING ERRCODE='42501'; END IF;
    SELECT * INTO v_destination FROM public.resolve_financial_destination();
  ELSIF v_type='package' AND v_package IS NOT NULL AND v_service IS NULL THEN
    SELECT * INTO v_source FROM public.service_packages WHERE id=v_package AND account_owner_id=v_owner;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pacote não disponível.' USING ERRCODE='42501'; END IF;
    v_name:=v_source.name;
    SELECT * INTO v_destination FROM public.resolve_financial_destination(v_source.professional_id);
    IF v_client IS NOT NULL THEN
      SELECT count(*) INTO v_count FROM public.package_template_steps WHERE template_id=v_source.template_id;
      IF v_source.package_type<>'sequential' OR v_count=0 THEN v_count:=v_source.total_sessions; END IF;
      IF coalesce(v_count,0)<=0 THEN RAISE EXCEPTION 'Confira as sessões do pacote.'; END IF;
      INSERT INTO public.service_packages(name,description,client_id,template_id,total_sessions,duration,interval_days,total_price,package_type,service_id,professional_id,room_id,equipment,payment_methods,payment_type,sessions_scheduled,is_active,category,account_owner_id,visibility)
      VALUES(v_source.name,v_source.description,v_client,v_source.template_id,v_count,v_source.duration,v_source.interval_days,v_final,v_source.package_type,v_source.service_id,v_source.professional_id,v_source.room_id,v_source.equipment,ARRAY[v_method::text],'full',0,true,v_source.category,v_owner,v_source.visibility) RETURNING id INTO v_package;
      IF v_source.package_type='sequential' AND EXISTS(SELECT 1 FROM public.package_template_steps WHERE template_id=v_source.template_id) THEN
        FOR v_step IN SELECT * FROM public.package_template_steps WHERE template_id=v_source.template_id ORDER BY sequence_order LOOP
          v_i:=v_i+1;
          INSERT INTO public.package_appointments(package_id,service_id,session_number,original_session_number,sequence_order,interval_after_days,status,account_owner_id)
          VALUES(v_package,v_step.service_id,v_i,v_i,v_i,CASE WHEN v_i=v_count THEN 0 ELSE v_step.interval_after_days END,'pending',v_owner);
        END LOOP;
      ELSE
        INSERT INTO public.package_appointments(package_id,service_id,session_number,original_session_number,sequence_order,interval_after_days,status,account_owner_id)
        SELECT v_package,v_source.service_id,i,i,i,CASE WHEN i=v_count THEN 0 ELSE v_source.interval_days END,'pending',v_owner FROM generate_series(1,v_count) i;
      END IF;
    END IF;
  ELSE RAISE EXCEPTION 'Escolha um serviço ou pacote válido.'; END IF;
  INSERT INTO public.single_sales(client_id,service_id,package_id,item_type,description,original_amount,discount_amount,final_amount,payment_method_id,bank_id,sale_date,notes,created_by,paid_by,paid_at,installments,card_fee_amount,account_owner_id,sale_committed,request_id)
  VALUES(v_client,v_service,v_package,v_type,v_name,v_original,v_discount,v_final,v_method,v_bank,v_date,_sale->>'notes',v_user,v_user,now(),greatest(coalesce((_sale->>'installments')::integer,1),1),greatest(coalesce((_sale->>'card_fee_amount')::numeric,0),0),v_owner,true,_request_id) RETURNING * INTO v_sale;
  IF v_type='service' AND v_client IS NOT NULL THEN
    INSERT INTO public.client_services(client_id,service_id,sale_id,amount_paid,status,created_by,account_owner_id) VALUES(v_client,v_service,v_sale.id,v_final,'available',v_user,v_owner);
  END IF;
  IF v_destination.cash_register_id IS NOT NULL THEN
    INSERT INTO public.cash_transactions(cash_register_id,type,category,description,amount,payment_method,bank_id,reference_id,reference_type,created_by,professional_id,account_owner_id,card_fee_amount,installments)
    VALUES(v_destination.cash_register_id,'income',CASE WHEN v_type='package' THEN 'Venda de Pacote' ELSE 'Venda de Serviço' END,'Venda: '||v_name,v_final,v_pm_name,v_bank,v_sale.id,'single_sale',v_user,v_destination.professional_id,v_owner,v_sale.card_fee_amount,v_sale.installments);
  END IF;
  INSERT INTO public.financial_entries(type,description,amount,due_date,paid_date,status,payment_method_id,bank_id,client_id,created_by,paid_by,sale_id,professional_id,account_owner_id)
  VALUES('receivable','Venda: '||v_name,v_final,v_date,v_date,'paid',v_method,v_bank,v_client,v_user,v_user,v_sale.id,v_destination.professional_id,v_owner);
  RETURN to_jsonb(v_sale);
END; $$;
REVOKE ALL ON FUNCTION public.create_single_sale_atomic(jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_single_sale_atomic(jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_single_sale_atomic(jsonb,uuid) TO service_role;