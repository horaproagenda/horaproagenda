CREATE OR REPLACE FUNCTION public.save_application_record_atomic(_id uuid, _record jsonb, _items jsonb, _values jsonb, _finalize boolean DEFAULT false, _expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  old_record public.application_records;
  saved public.application_records;
  template public.procedure_templates;
  owner_id uuid := public.current_account_owner_id();
  prof_id uuid := nullif(_record->>'professional_id','')::uuid;
  client uuid := (_record->>'client_id')::uuid;
  template_id uuid := nullif(_record->>'procedure_template_id','')::uuid;
  appt_id uuid := nullif(_record->>'appointment_id','')::uuid;
  reference_id uuid := nullif(_record->>'based_on_id','')::uuid;
  snapshot jsonb;
  performed timestamptz;
  item jsonb;
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR owner_id IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para salvar a ficha.'; END IF;
  IF public.is_receptionist_only() OR NOT coalesce(public.can_access_client_record(client),false) THEN RAISE EXCEPTION 'Você não tem permissão para preencher esta ficha.'; END IF;
  IF NOT public.has_role(auth.uid(),'admin') THEN
    prof_id := public.get_professional_id_for_user(auth.uid());
    IF prof_id IS NULL OR (nullif(_record->>'professional_id','')::uuid IS NOT NULL AND nullif(_record->>'professional_id','')::uuid <> prof_id) THEN RAISE EXCEPTION 'Confira o profissional responsável pela ficha.'; END IF;
  END IF;
  IF prof_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.professionals WHERE id=prof_id AND account_owner_id=owner_id) THEN RAISE EXCEPTION 'Confira o profissional responsável pela ficha.'; END IF;
  IF coalesce(trim(_record->>'procedure_name'),'')='' THEN RAISE EXCEPTION 'Informe o procedimento.'; END IF;
  IF coalesce(_record->>'performed_at','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' THEN RAISE EXCEPTION 'Informe uma data e hora válidas para a ficha.'; END IF;
  performed := (_record->>'performed_at')::timestamp AT TIME ZONE 'America/Sao_Paulo';
  IF appt_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.appointments WHERE id=appt_id AND client_id=client AND account_owner_id=owner_id) THEN RAISE EXCEPTION 'O agendamento deve pertencer ao cliente da ficha.'; END IF;
  IF reference_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.application_records WHERE id=reference_id AND client_id=client AND account_owner_id=owner_id) THEN RAISE EXCEPTION 'A ficha de referência deve pertencer ao mesmo cliente.'; END IF;
  IF jsonb_typeof(_items) IS DISTINCT FROM 'array' OR jsonb_typeof(_values) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Confira os itens e as respostas da ficha.'; END IF;
  -- Serialize retries using the stable draft ID, including the first insert.
  PERFORM pg_advisory_xact_lock(hashtextextended(_id::text,0));
  SELECT * INTO old_record FROM public.application_records WHERE id=_id FOR UPDATE;
  IF FOUND THEN
    IF old_record.client_id <> client OR NOT coalesce(public.can_write_application(_id),false) OR old_record.status IN ('completed','cancelled','amended') THEN RAISE EXCEPTION 'Esta ficha não pode ser alterada. Reabra o histórico para conferir.'; END IF;
    IF _expected_updated_at IS NULL OR old_record.updated_at IS DISTINCT FROM _expected_updated_at THEN RAISE EXCEPTION 'Esta ficha foi atualizada em outro acesso. Reabra a ficha antes de salvar.'; END IF;
  ELSIF _expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'A ficha não está disponível. Reabra o histórico.';
  END IF;
  IF old_record.id IS NOT NULL AND template_id IS NOT DISTINCT FROM old_record.procedure_template_id THEN
    snapshot := old_record.template_snapshot;
  ELSIF template_id IS NOT NULL THEN
    SELECT * INTO template FROM public.procedure_templates WHERE id=template_id AND is_active AND (account_owner_id IS NULL OR account_owner_id=owner_id);
    IF NOT FOUND THEN RAISE EXCEPTION 'O modelo não está disponível. Selecione outro modelo.'; END IF;
    snapshot := jsonb_build_object('fields',template.fields,'version',template.version);
  ELSE snapshot := jsonb_build_object('fields','[]'::jsonb,'version',1);
  END IF;
  IF old_record.id IS NULL THEN
    INSERT INTO public.application_records(id,account_owner_id,client_id,professional_id,procedure_template_id,procedure_name,template_snapshot,appointment_id,room,reason,status,performed_at,follow_up_date,based_on_id)
    VALUES (_id,owner_id,client,prof_id,template_id,trim(_record->>'procedure_name'),snapshot,appt_id,nullif(_record->>'room',''),nullif(_record->>'reason',''),'draft',performed,nullif(_record->>'follow_up_date','')::date,reference_id);
  ELSE
    UPDATE public.application_records SET professional_id=prof_id,procedure_template_id=template_id,procedure_name=trim(_record->>'procedure_name'),template_snapshot=snapshot,appointment_id=appt_id,room=nullif(_record->>'room',''),reason=nullif(_record->>'reason',''),performed_at=performed,follow_up_date=nullif(_record->>'follow_up_date','')::date WHERE id=_id;
  END IF;
  DELETE FROM public.application_items WHERE application_id=_id;
  FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    IF nullif(item->>'product_id','') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.products WHERE id=(item->>'product_id')::uuid AND account_owner_id=owner_id) THEN RAISE EXCEPTION 'Um produto não está disponível para esta ficha.'; END IF;
  END LOOP;
  INSERT INTO public.application_items(application_id,position,product_id,product_name_snapshot,manufacturer_snapshot,lot_number,expiration_date,region,side,quantity,unit,technique,dilution,instrument,notes)
  SELECT _id,(ordinality-1)::int,nullif(value->>'product_id','')::uuid,coalesce(value->>'product_name_snapshot',''),nullif(value->>'manufacturer_snapshot',''),nullif(value->>'lot_number',''),nullif(value->>'expiration_date','')::date,coalesce(value->>'region',''),nullif(value->>'side',''),nullif(value->>'quantity','')::numeric,coalesce(value->>'unit','ml'),nullif(value->>'technique',''),nullif(value->>'dilution',''),nullif(value->>'instrument',''),nullif(value->>'notes','') FROM jsonb_array_elements(_items) WITH ORDINALITY;
  DELETE FROM public.application_field_values WHERE application_id=_id;
  INSERT INTO public.application_field_values(application_id,field_id,value) SELECT _id,key,value FROM jsonb_each_text(_values);
  IF _finalize THEN
    result := public.complete_application_record(_id);
    IF NOT coalesce((result->>'ok')::boolean,false) THEN
      RAISE EXCEPTION 'Não foi possível finalizar. Confira: %.', coalesce((SELECT string_agg(value,', ') FROM jsonb_array_elements_text(result->'missing')),'os campos obrigatórios e sua permissão');
    END IF;
  END IF;
  SELECT * INTO saved FROM public.application_records WHERE id=_id;
  RETURN jsonb_build_object('ok',true,'id',saved.id,'status',saved.status,'updated_at',saved.updated_at);
END $$;
REVOKE ALL ON FUNCTION public.save_application_record_atomic(uuid,jsonb,jsonb,jsonb,boolean,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_application_record_atomic(uuid,jsonb,jsonb,jsonb,boolean,timestamptz) TO authenticated;
