ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cycle_unit text;
ALTER TABLE public.product_purchases ADD COLUMN IF NOT EXISTS cycle_unit text;

CREATE OR REPLACE FUNCTION public.convert_product_quantity(
  _value numeric,
  _from text,
  _to text
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_from_family text;
  v_to_family text;
  v_from_factor numeric;
  v_to_factor numeric;
BEGIN
  IF _value IS NULL THEN RETURN NULL; END IF;
  v_from_family := CASE WHEN _from IN ('mg','g','kg') THEN 'mass' WHEN _from IN ('ml','l') THEN 'volume' WHEN _from='un' THEN 'count' WHEN _from='other' THEN 'other' END;
  v_to_family := CASE WHEN _to IN ('mg','g','kg') THEN 'mass' WHEN _to IN ('ml','l') THEN 'volume' WHEN _to='un' THEN 'count' WHEN _to='other' THEN 'other' END;
  IF v_from_family IS NULL OR v_to_family IS NULL OR v_from_family <> v_to_family THEN RETURN NULL; END IF;
  v_from_factor := CASE _from WHEN 'mg' THEN 0.001 WHEN 'g' THEN 1 WHEN 'kg' THEN 1000 WHEN 'ml' THEN 1 WHEN 'l' THEN 1000 ELSE 1 END;
  v_to_factor := CASE _to WHEN 'mg' THEN 0.001 WHEN 'g' THEN 1 WHEN 'kg' THEN 1000 WHEN 'ml' THEN 1 WHEN 'l' THEN 1000 ELSE 1 END;
  RETURN (_value * v_from_factor) / v_to_factor;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_product_usage_cycle(
  _product_id uuid,
  _start_date date,
  _quantity numeric,
  _unit text,
  _purchase_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_purchase public.product_purchases%ROWTYPE;
  v_purchase_id uuid;
  v_user uuid := auth.uid();
  v_stock_quantity numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Faça login novamente para registrar o uso.'; END IF;
  IF _start_date IS NULL THEN RAISE EXCEPTION 'Informe a data de início.'; END IF;
  IF COALESCE(_quantity, 0) <= 0 THEN RAISE EXCEPTION 'Informe uma quantidade maior que zero.'; END IF;
  IF _unit NOT IN ('un','mg','g','kg','ml','l','other') THEN RAISE EXCEPTION 'Informe uma grandeza válida.'; END IF;

  SELECT * INTO v_product FROM public.products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado ou sem acesso.'; END IF;
  v_stock_quantity := public.convert_product_quantity(_quantity, _unit, v_product.unit);
  IF v_stock_quantity IS NULL THEN RAISE EXCEPTION 'A grandeza escolhida não é compatível com a grandeza do estoque.'; END IF;
  IF v_stock_quantity > COALESCE(v_product.current_stock, 0) THEN RAISE EXCEPTION 'A quantidade em uso não pode ser maior que o estoque disponível.'; END IF;
  IF EXISTS (SELECT 1 FROM public.product_purchases WHERE product_id=_product_id AND started_using_at IS NOT NULL AND finished_at IS NULL AND (_purchase_id IS NULL OR id<>_purchase_id)) THEN
    RAISE EXCEPTION 'Este produto já possui uma quantidade em uso.';
  END IF;

  IF _purchase_id IS NOT NULL THEN
    SELECT * INTO v_purchase FROM public.product_purchases WHERE id=_purchase_id AND product_id=_product_id FOR UPDATE;
  ELSE
    SELECT * INTO v_purchase FROM public.product_purchases WHERE product_id=_product_id AND started_using_at IS NULL AND finished_at IS NULL ORDER BY purchase_date,created_at LIMIT 1 FOR UPDATE;
  END IF;

  IF v_purchase.id IS NOT NULL THEN
    UPDATE public.product_purchases SET started_using_at=_start_date, finished_at=NULL, cycle_quantity=v_stock_quantity, cycle_unit=_unit, cycle_appointments=NULL, avg_quantity_per_appointment=NULL, updated_by=v_user WHERE id=v_purchase.id RETURNING id INTO v_purchase_id;
  ELSE
    INSERT INTO public.product_purchases(product_id,quantity,unit_price,total_price,purchase_date,started_using_at,cycle_quantity,cycle_unit,created_by,updated_by,account_owner_id,notes)
    VALUES(_product_id,v_stock_quantity,0,0,_start_date,_start_date,v_stock_quantity,_unit,v_user,v_user,v_product.account_owner_id,'Ciclo iniciado sem nova compra') RETURNING id INTO v_purchase_id;
  END IF;

  UPDATE public.products SET started_using_at=_start_date,finished_at=NULL,cycle_quantity=v_stock_quantity,cycle_unit=_unit,updated_by=v_user WHERE id=_product_id;
  RETURN jsonb_build_object('product_id',_product_id,'purchase_id',v_purchase_id,'start_date',_start_date,'quantity',_quantity,'stock_quantity',v_stock_quantity,'unit',_unit);
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_product_usage_cycle(
  _product_id uuid,
  _purchase_id uuid,
  _end_date date,
  _unit text,
  _appointment_ids uuid[],
  _appointment_dates date[],
  _service_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE; v_purchase public.product_purchases%ROWTYPE; v_existing public.product_usage_records%ROWTYPE;
  v_user uuid:=auth.uid(); v_cycle_key text:=_purchase_id::text; v_stock_quantity numeric; v_display_quantity numeric; v_stock_after numeric;
  v_count integer:=COALESCE(array_length(_appointment_ids,1),0); v_days integer; v_average numeric; v_index integer; v_base numeric; v_remainder numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Faça login novamente para registrar o uso.'; END IF;
  IF _purchase_id IS NULL OR _end_date IS NULL THEN RAISE EXCEPTION 'Informe o ciclo e a data de término.'; END IF;
  IF COALESCE(array_length(_appointment_dates,1),0)<>v_count OR (_service_ids IS NOT NULL AND COALESCE(array_length(_service_ids,1),0)<>v_count) THEN RAISE EXCEPTION 'Os atendimentos do ciclo estão incompletos.'; END IF;

  SELECT * INTO v_existing FROM public.product_usage_records WHERE product_id=_product_id AND cycle_key=v_cycle_key;
  IF FOUND THEN RETURN jsonb_build_object('product_id',_product_id,'purchase_id',_purchase_id,'usage_record_id',v_existing.id,'stock_after',v_existing.stock_after,'already_finished',true); END IF;

  SELECT * INTO v_product FROM public.products WHERE id=_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado ou sem acesso.'; END IF;
  SELECT * INTO v_purchase FROM public.product_purchases WHERE id=_purchase_id AND product_id=_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro da quantidade em uso não encontrado.'; END IF;
  IF v_purchase.started_using_at IS NULL THEN RAISE EXCEPTION 'Registre a data de início antes do término.'; END IF;
  IF _end_date<v_purchase.started_using_at THEN RAISE EXCEPTION 'A data de término não pode ser anterior ao início.'; END IF;
  IF COALESCE(v_purchase.cycle_unit,v_product.cycle_unit,_unit)<>_unit THEN RAISE EXCEPTION 'A grandeza deve permanecer igual à registrada no início.'; END IF;

  v_stock_quantity:=COALESCE(NULLIF(v_purchase.cycle_quantity,0),NULLIF(v_product.cycle_quantity,0));
  IF COALESCE(v_stock_quantity,0)<=0 THEN RAISE EXCEPTION 'A quantidade em uso não foi informada.'; END IF;
  IF v_stock_quantity>COALESCE(v_product.current_stock,0) THEN RAISE EXCEPTION 'A quantidade usada é maior que o estoque disponível.'; END IF;
  v_display_quantity:=public.convert_product_quantity(v_stock_quantity,v_product.unit,_unit);
  IF v_display_quantity IS NULL THEN RAISE EXCEPTION 'A grandeza do ciclo não é compatível com a grandeza do estoque.'; END IF;

  v_days:=(_end_date-v_purchase.started_using_at)+1; v_average:=CASE WHEN v_count>0 THEN v_display_quantity/v_count ELSE NULL END; v_stock_after:=GREATEST(0,COALESCE(v_product.current_stock,0)-v_stock_quantity);
  UPDATE public.product_purchases SET finished_at=_end_date,cycle_quantity=v_stock_quantity,cycle_unit=_unit,cycle_appointments=v_count,avg_quantity_per_appointment=v_average,duration_days=v_days,updated_by=v_user WHERE id=_purchase_id;
  INSERT INTO public.product_usage_records(product_id,calc_mode,container_amount,container_unit,quantity_per_appointment,avg_quantity_per_appointment,start_date,end_date,appointments_counted,appointment_ids,total_consumed,container_yield,created_by,account_owner_id,cycle_key,stock_after)
  VALUES(_product_id,'auto',v_display_quantity,_unit,NULL,v_average,v_purchase.started_using_at,_end_date,v_count,COALESCE(_appointment_ids,ARRAY[]::uuid[]),v_display_quantity,NULLIF(v_count,0),v_user,v_product.account_owner_id,v_cycle_key,v_stock_after) RETURNING * INTO v_existing;

  IF v_count=0 THEN
    INSERT INTO public.product_daily_consumption(product_id,consumption_date,quantity_used,unit,professional_id,service_id,appointment_id,notes,created_by,account_owner_id,cycle_key)
    VALUES(_product_id,_end_date,v_display_quantity,_unit,v_product.owner_professional_id,NULL,NULL,'Consumo do ciclo de uso',v_user,v_product.account_owner_id,v_cycle_key);
  ELSE
    v_base:=trunc((v_display_quantity/v_count)*10000)/10000; v_remainder:=v_display_quantity-(v_base*v_count);
    FOR v_index IN 1..v_count LOOP
      INSERT INTO public.product_daily_consumption(product_id,consumption_date,quantity_used,unit,professional_id,service_id,appointment_id,notes,created_by,account_owner_id,cycle_key)
      VALUES(_product_id,_appointment_dates[v_index],CASE WHEN v_index=v_count THEN v_base+v_remainder ELSE v_base END,_unit,v_product.owner_professional_id,CASE WHEN _service_ids IS NULL THEN NULL ELSE _service_ids[v_index] END,_appointment_ids[v_index],'Consumo do ciclo de uso',v_user,v_product.account_owner_id,v_cycle_key);
    END LOOP;
  END IF;
  UPDATE public.products SET finished_at=_end_date,current_stock=v_stock_after,cycle_quantity=NULL,cycle_unit=NULL,updated_by=v_user WHERE id=_product_id;
  RETURN jsonb_build_object('product_id',_product_id,'purchase_id',_purchase_id,'usage_record_id',v_existing.id,'start_date',v_purchase.started_using_at,'end_date',_end_date,'quantity',v_display_quantity,'stock_quantity',v_stock_quantity,'unit',_unit,'appointments',v_count,'average_per_appointment',v_average,'duration_days',v_days,'stock_after',v_stock_after,'already_finished',false);
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO v_existing FROM public.product_usage_records WHERE product_id=_product_id AND cycle_key=v_cycle_key;
  RETURN jsonb_build_object('product_id',_product_id,'purchase_id',_purchase_id,'usage_record_id',v_existing.id,'stock_after',v_existing.stock_after,'already_finished',true);
END;
$$;