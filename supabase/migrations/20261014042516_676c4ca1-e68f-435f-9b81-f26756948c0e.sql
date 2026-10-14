-- Rollback: retain new historical fields; restore preceding RPC grants if needed.
ALTER TABLE public.product_daily_consumption ADD COLUMN IF NOT EXISTS request_id uuid, ADD COLUMN IF NOT EXISTS stock_quantity numeric, ADD COLUMN IF NOT EXISTS cancelled_at timestamptz, ADD COLUMN IF NOT EXISTS cancellation_reason text;
CREATE UNIQUE INDEX IF NOT EXISTS manual_consumption_request_unique ON public.product_daily_consumption(created_by,request_id) WHERE request_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.record_manual_product_consumption(_input jsonb,_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products; r public.product_daily_consumption; q numeric; amount numeric; u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR _request_id IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para registrar consumo.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text||_request_id::text,0));
 SELECT * INTO p FROM public.products WHERE id=(_input->>'product_id')::uuid FOR UPDATE;
 IF p.id IS NULL OR NOT public._can_manage_product_purchase(p) OR NOT public.can_write_record(p.owner_professional_id,'produtos','edit') THEN RAISE EXCEPTION 'Você não tem permissão para registrar consumo deste produto.' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.product_daily_consumption WHERE created_by=u AND request_id=_request_id;
 IF r.id IS NOT NULL THEN
 IF r.product_id<>p.id THEN RAISE EXCEPTION 'Esta solicitação pertence a outro produto.'; END IF;
 RETURN to_jsonb(r); END IF;
 amount:=(_input->>'quantity_used')::numeric; q:=public.convert_product_quantity(amount,_input->>'unit',p.unit);
 IF amount IS NULL OR amount<=0 OR amount::text IN ('NaN','Infinity','-Infinity') OR q IS NULL OR q<=0 THEN RAISE EXCEPTION 'Informe quantidade positiva e uma unidade compatível.'; END IF;
 IF nullif(_input->>'consumption_date','') IS NULL THEN RAISE EXCEPTION 'Informe a data do consumo.'; END IF;
 IF coalesce(p.current_stock,0)-q<0 OR EXISTS(SELECT 1 FROM public.product_usage_records WHERE product_id=p.id AND status IN ('planned','in_use') AND stock_quantity>p.current_stock-q) THEN RAISE EXCEPTION 'O consumo excede o estoque disponível fora do ciclo de uso.'; END IF;
 IF nullif(_input->>'appointment_id','') IS NOT NULL OR nullif(_input->>'service_id','') IS NOT NULL THEN RAISE EXCEPTION 'Consumo de atendimento deve ser apurado pela operação oficial do ciclo.'; END IF;
 INSERT INTO public.product_daily_consumption(product_id,consumption_date,quantity_used,unit,professional_id,created_by,account_owner_id,notes,request_id,stock_quantity)
 VALUES(p.id,(_input->>'consumption_date')::date,amount,_input->>'unit',p.owner_professional_id,u,p.account_owner_id,_input->>'notes',_request_id,q) RETURNING * INTO r;
 UPDATE public.products SET current_stock=current_stock-q,updated_by=u WHERE id=p.id;
 INSERT INTO public.product_usage_events(product_id,account_owner_id,event_type,old_data,new_data,stock_delta,changed_by) VALUES(p.id,p.account_owner_id,'manual_consumption_recorded',jsonb_build_object('stock',p.current_stock),to_jsonb(r),-q,u);
 RETURN to_jsonb(r);
END $$;
CREATE OR REPLACE FUNCTION public.cancel_manual_product_consumption(_id uuid,_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products; r public.product_daily_consumption; old_r jsonb;
BEGIN
 SELECT * INTO p FROM public.products WHERE id=(SELECT product_id FROM public.product_daily_consumption WHERE id=_id) FOR UPDATE;
 IF auth.uid() IS NULL OR p.id IS NULL OR NOT public._can_manage_product_purchase(p) OR NOT public.can_write_record(p.owner_professional_id,'produtos','edit') THEN RAISE EXCEPTION 'Você não tem permissão para cancelar este consumo.' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.product_daily_consumption WHERE id=_id FOR UPDATE;
 IF r.request_id IS NULL OR r.stock_quantity IS NULL OR r.cycle_key IS NOT NULL THEN RAISE EXCEPTION 'Este consumo pertence a um ciclo ou registro antigo. Corrija pela operação de uso ou ajuste auditado.'; END IF;
 IF r.cancelled_at IS NOT NULL THEN RETURN to_jsonb(r); END IF;
 IF nullif(btrim(_reason),'') IS NULL THEN RAISE EXCEPTION 'Informe o motivo do cancelamento.'; END IF;
 old_r:=to_jsonb(r);
 UPDATE public.product_daily_consumption SET cancelled_at=now(),cancellation_reason=_reason WHERE id=r.id RETURNING * INTO r;
 UPDATE public.products SET current_stock=current_stock+r.stock_quantity,updated_by=auth.uid() WHERE id=p.id;
 INSERT INTO public.product_usage_events(product_id,account_owner_id,event_type,old_data,new_data,stock_delta,reason,changed_by) VALUES(p.id,p.account_owner_id,'manual_consumption_cancelled',old_r,to_jsonb(r),r.stock_quantity,_reason,auth.uid());
 RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION public.record_manual_product_consumption(jsonb,uuid),public.cancel_manual_product_consumption(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_manual_product_consumption(jsonb,uuid),public.cancel_manual_product_consumption(uuid,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.guard_official_consumption() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF current_user IN ('authenticated','anon') AND ((TG_OP='INSERT' AND (NEW.request_id IS NOT NULL OR NEW.cycle_key IS NOT NULL)) OR (TG_OP IN ('UPDATE','DELETE') AND (OLD.request_id IS NOT NULL OR OLD.cycle_key IS NOT NULL))) THEN RAISE EXCEPTION 'Altere este consumo pela operação oficial do produto.' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER official_consumption_guard BEFORE INSERT OR UPDATE OR DELETE ON public.product_daily_consumption FOR EACH ROW EXECUTE FUNCTION public.guard_official_consumption();
REVOKE ALL ON FUNCTION public.guard_official_consumption() FROM PUBLIC,anon,authenticated;
