-- Rollback: restore previous cycle RPCs/legacy date guards from prior migrations; retain usage/events history.
ALTER TABLE public.product_usage_records ALTER COLUMN start_date DROP NOT NULL, ALTER COLUMN end_date DROP NOT NULL;
ALTER TABLE public.product_usage_records ADD COLUMN IF NOT EXISTS purchase_id uuid REFERENCES public.product_purchases(id) ON DELETE RESTRICT, ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed', ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1, ADD COLUMN IF NOT EXISTS duration_days integer, ADD COLUMN IF NOT EXISTS stock_quantity numeric, ADD COLUMN IF NOT EXISTS cancellation_reason text;
CREATE UNIQUE INDEX IF NOT EXISTS product_one_open_usage ON public.product_usage_records(product_id) WHERE status IN ('planned','in_use');
CREATE TABLE public.product_usage_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), usage_id uuid REFERENCES public.product_usage_records(id) ON DELETE RESTRICT, product_id uuid NOT NULL, account_owner_id uuid NOT NULL, event_type text NOT NULL, old_data jsonb, new_data jsonb, stock_delta numeric NOT NULL DEFAULT 0, reason text, changed_by uuid, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.product_usage_events TO authenticated;
GRANT ALL ON public.product_usage_events TO service_role;
ALTER TABLE public.product_usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY usage_events_read ON public.product_usage_events FOR SELECT TO authenticated USING (account_owner_id=public.current_account_owner_id() AND EXISTS (SELECT 1 FROM public.products p WHERE p.id=product_id));
REVOKE INSERT, UPDATE, DELETE ON public.product_usage_records FROM authenticated, anon;
GRANT SELECT ON public.product_usage_records TO authenticated;
GRANT ALL ON public.product_usage_records TO service_role;
CREATE OR REPLACE FUNCTION public.validate_product_usage_record() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.status NOT IN ('planned','in_use','completed','cancelled') THEN RAISE EXCEPTION 'Situação do uso inválida.'; END IF;
 IF NEW.container_amount<=0 OR COALESCE(NEW.stock_quantity,NEW.container_amount)<=0 THEN RAISE EXCEPTION 'Informe uma quantidade maior que zero.'; END IF;
 IF NEW.status='planned' AND (NEW.start_date IS NOT NULL OR NEW.end_date IS NOT NULL) THEN RAISE EXCEPTION 'Um uso planejado não pode ter datas registradas.'; END IF;
 IF NEW.status='in_use' AND (NEW.start_date IS NULL OR NEW.end_date IS NOT NULL) THEN RAISE EXCEPTION 'Registre o início e deixe o término vazio durante o uso.'; END IF;
 IF NEW.end_date IS NOT NULL AND (NEW.start_date IS NULL OR NEW.end_date<NEW.start_date) THEN RAISE EXCEPTION 'A data de término não pode ser anterior à data de início.'; END IF;
 IF NEW.status='completed' AND (NEW.start_date IS NULL OR NEW.end_date IS NULL) THEN RAISE EXCEPTION 'Registre início e término antes de concluir o uso.'; END IF;
 IF NEW.status='cancelled' AND NULLIF(btrim(NEW.cancellation_reason),'') IS NULL THEN RAISE EXCEPTION 'Informe o motivo do cancelamento.'; END IF;
 NEW.duration_days:=CASE WHEN NEW.status='completed' THEN NEW.end_date-NEW.start_date+1 ELSE NULL END;
 IF TG_OP='UPDATE' THEN NEW.version:=OLD.version+1; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_product_usage BEFORE INSERT OR UPDATE ON public.product_usage_records FOR EACH ROW EXECUTE FUNCTION public.validate_product_usage_record();
CREATE OR REPLACE FUNCTION public.keep_purchase_usage_dates_legacy() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u public.product_usage_records;
BEGIN
 SELECT * INTO u FROM public.product_usage_records WHERE purchase_id=NEW.id ORDER BY created_at DESC LIMIT 1;
 IF u.id IS NOT NULL THEN
   NEW.started_using_at:=u.start_date; NEW.finished_at:=CASE WHEN u.status='completed' THEN u.end_date ELSE NULL END;
   NEW.cycle_quantity:=u.stock_quantity; NEW.cycle_unit:=u.container_unit; NEW.duration_days:=u.duration_days;
 ELSE
   IF TG_OP='INSERT' THEN NEW.started_using_at:=NULL; NEW.finished_at:=NULL;
   ELSE NEW.started_using_at:=OLD.started_using_at; NEW.finished_at:=OLD.finished_at; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.sync_product_active_cycle() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.mirror_product_usage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.purchase_id IS NOT NULL THEN
 UPDATE public.product_purchases SET started_using_at=NEW.start_date,finished_at=CASE WHEN NEW.status='completed' THEN NEW.end_date ELSE NULL END,cycle_quantity=NEW.stock_quantity,cycle_unit=NEW.container_unit,cycle_appointments=NEW.appointments_counted,avg_quantity_per_appointment=NEW.avg_quantity_per_appointment,duration_days=NEW.duration_days,updated_by=auth.uid() WHERE id=NEW.purchase_id;
 END IF;
 IF NEW.status IN ('planned','in_use','completed') OR NOT EXISTS(SELECT 1 FROM public.product_usage_records WHERE product_id=NEW.product_id AND status IN ('planned','in_use')) THEN
 UPDATE public.products SET started_using_at=CASE WHEN NEW.status='cancelled' THEN NULL ELSE NEW.start_date END, finished_at=CASE WHEN NEW.status='completed' THEN NEW.end_date ELSE NULL END,cycle_quantity=CASE WHEN NEW.status='in_use' THEN NEW.stock_quantity ELSE NULL END,cycle_unit=CASE WHEN NEW.status='in_use' THEN NEW.container_unit ELSE NULL END,updated_by=auth.uid() WHERE id=NEW.product_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mirror_product_usage AFTER INSERT OR UPDATE ON public.product_usage_records FOR EACH ROW EXECUTE FUNCTION public.mirror_product_usage();
CREATE OR REPLACE FUNCTION public.product_usage_result(_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$ SELECT to_jsonb(u)||jsonb_build_object('usage_record_id',u.id,'quantity',u.container_amount,'unit',u.container_unit,'appointments',u.appointments_counted,'average_per_appointment',u.avg_quantity_per_appointment) FROM public.product_usage_records u WHERE u.id=_id $$;
REVOKE ALL ON FUNCTION public.product_usage_result(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.product_usage_result(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.create_product_usage_plan(_product_id uuid,_quantity numeric,_unit text,_purchase_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products; u public.product_usage_records; q numeric;
BEGIN
 SELECT * INTO p FROM public.products WHERE id=_product_id FOR UPDATE;
 IF p.id IS NULL OR auth.uid() IS NULL OR NOT public._can_manage_product_purchase(p) OR NOT public.can_write_record(p.owner_professional_id,'produtos','edit') THEN RAISE EXCEPTION 'Você não tem permissão para registrar o uso deste produto.'; END IF;
 IF EXISTS(SELECT 1 FROM public.product_usage_records WHERE product_id=p.id AND status IN ('planned','in_use')) THEN RAISE EXCEPTION 'Este produto já possui uma quantidade em uso ou planejada.'; END IF;
 IF p.started_using_at IS NOT NULL AND p.finished_at IS NULL THEN RAISE EXCEPTION 'Este produto possui um uso anterior que precisa ser conferido antes de iniciar outro.'; END IF;
 IF _purchase_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.product_purchases WHERE id=_purchase_id AND product_id=p.id AND started_using_at IS NULL AND finished_at IS NULL) THEN RAISE EXCEPTION 'Esta compra já possui uso registrado. Corrija o registro existente.'; END IF;
 q:=public.convert_product_quantity(_quantity,_unit,p.unit);
 IF _quantity IS NULL OR _quantity<=0 OR q IS NULL OR q<=0 THEN RAISE EXCEPTION 'Informe quantidade positiva e uma grandeza compatível com o estoque.'; END IF;
 IF q>p.current_stock THEN RAISE EXCEPTION 'A quantidade em uso não pode ser maior que o estoque disponível.'; END IF;
 INSERT INTO public.product_usage_records(product_id,purchase_id,account_owner_id,created_by,calc_mode,container_amount,container_unit,stock_quantity,status,appointments_counted,appointment_ids,cycle_key)
 VALUES(p.id,_purchase_id,p.account_owner_id,auth.uid(),'auto',_quantity,_unit,q,'planned',0,ARRAY[]::uuid[],gen_random_uuid()::text) RETURNING * INTO u;
 INSERT INTO public.product_usage_events(usage_id,product_id,account_owner_id,event_type,new_data,changed_by) VALUES(u.id,p.id,p.account_owner_id,'usage_created',to_jsonb(u),auth.uid());
 RETURN public.product_usage_result(u.id);
END $$;
CREATE OR REPLACE FUNCTION public.activate_product_usage(_usage_id uuid,_start_date date,_expected_version integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products; u public.product_usage_records; old_u jsonb;
BEGIN
 SELECT * INTO p FROM public.products WHERE id=(SELECT product_id FROM public.product_usage_records WHERE id=_usage_id) FOR UPDATE;
 IF p.id IS NULL OR auth.uid() IS NULL OR NOT public._can_manage_product_purchase(p) OR NOT public.can_write_record(p.owner_professional_id,'produtos','edit') THEN RAISE EXCEPTION 'Você não tem permissão para iniciar este uso.'; END IF;
 SELECT * INTO u FROM public.product_usage_records WHERE id=_usage_id FOR UPDATE;
 IF u.version IS DISTINCT FROM _expected_version THEN RAISE EXCEPTION 'Este registro foi alterado. Atualize a tela antes de salvar.'; END IF;
 IF u.status<>'planned' OR _start_date IS NULL THEN RAISE EXCEPTION 'O uso já foi iniciado ou a data não foi informada. Use a correção do registro.'; END IF;
 IF u.stock_quantity>p.current_stock THEN RAISE EXCEPTION 'A quantidade em uso é maior que o estoque disponível.'; END IF;
 old_u:=to_jsonb(u);
 UPDATE public.product_usage_records SET start_date=_start_date,status='in_use' WHERE id=u.id RETURNING * INTO u;
 INSERT INTO public.product_usage_events(usage_id,product_id,account_owner_id,event_type,old_data,new_data,changed_by) VALUES(u.id,p.id,p.account_owner_id,'usage_started',old_u,to_jsonb(u),auth.uid());
 RETURN public.product_usage_result(u.id);
END $$;
CREATE OR REPLACE FUNCTION public.start_product_usage_cycle(_product_id uuid,_start_date date,_quantity numeric,_unit text,_purchase_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb;
BEGIN
 IF _start_date IS NULL THEN RAISE EXCEPTION 'Informe a data de início.'; END IF;
 r:=public.create_product_usage_plan(_product_id,_quantity,_unit,_purchase_id);
 RETURN public.activate_product_usage((r->>'id')::uuid,_start_date,(r->>'version')::integer);
END $$;
CREATE OR REPLACE FUNCTION public.finish_product_usage_record(_usage_id uuid,_end_date date,_expected_version integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products; u public.product_usage_records; old_u jsonb; tz text; a record; ids uuid[]; n integer; base numeric; leftover numeric; i integer:=0;
BEGIN
 SELECT * INTO p FROM public.products WHERE id=(SELECT product_id FROM public.product_usage_records WHERE id=_usage_id) FOR UPDATE;
 IF p.id IS NULL OR auth.uid() IS NULL OR NOT public._can_manage_product_purchase(p) OR NOT public.can_write_record(p.owner_professional_id,'produtos','edit') THEN RAISE EXCEPTION 'Você não tem permissão para encerrar este uso.'; END IF;
 SELECT * INTO u FROM public.product_usage_records WHERE id=_usage_id FOR UPDATE;
 IF u.status='completed' THEN RETURN public.product_usage_result(u.id)||jsonb_build_object('already_finished',true); END IF;
 IF u.version IS DISTINCT FROM _expected_version THEN RAISE EXCEPTION 'Este registro foi alterado. Atualize a tela antes de salvar.'; END IF;
 IF u.status<>'in_use' OR u.start_date IS NULL THEN RAISE EXCEPTION 'Registre a data de início antes do término.'; END IF;
 IF _end_date IS NULL OR _end_date<u.start_date THEN RAISE EXCEPTION 'A data de término não pode ser anterior à data de início.'; END IF;
 IF u.stock_quantity>p.current_stock THEN RAISE EXCEPTION 'A quantidade usada é maior que o estoque disponível.'; END IF;
 SELECT COALESCE(timezone,'America/Sao_Paulo') INTO tz FROM public.business_settings WHERE account_owner_id=p.account_owner_id LIMIT 1; tz:=COALESCE(tz,'America/Sao_Paulo');
 SELECT COALESCE(array_agg(ap.id ORDER BY ap.start_time,ap.id),ARRAY[]::uuid[]) INTO ids FROM public.appointments ap
 LEFT JOIN public.package_appointments pa ON pa.id=ap.package_appointment_id LEFT JOIN public.service_packages sp ON sp.id=pa.package_id
 WHERE ap.account_owner_id=p.account_owner_id AND ap.status='completed' AND (ap.start_time AT TIME ZONE tz)::date BETWEEN u.start_date AND _end_date
 AND (p.owner_professional_id IS NULL OR ap.professional_id=p.owner_professional_id)
 AND (NOT EXISTS(SELECT 1 FROM public.service_products WHERE product_id=p.id) AND NOT EXISTS(SELECT 1 FROM public.package_template_products WHERE product_id=p.id)
 OR EXISTS(SELECT 1 FROM public.service_products link WHERE link.product_id=p.id AND link.service_id=ap.service_id)
 OR EXISTS(SELECT 1 FROM public.package_template_products link WHERE link.product_id=p.id AND link.template_id=sp.template_id))
 AND NOT EXISTS(SELECT 1 FROM public.product_usage_records other WHERE other.product_id=p.id AND other.id<>u.id AND other.status='completed' AND ap.id=ANY(other.appointment_ids));
 n:=cardinality(ids); base:=CASE WHEN n>0 THEN trunc(u.container_amount/n,10) ELSE u.container_amount END; leftover:=u.container_amount-base*n; old_u:=to_jsonb(u);
 UPDATE public.products SET current_stock=current_stock-u.stock_quantity,updated_by=auth.uid() WHERE id=p.id;
 UPDATE public.product_usage_records SET status='completed',end_date=_end_date,appointments_counted=n,appointment_ids=ids,total_consumed=container_amount,avg_quantity_per_appointment=CASE WHEN n>0 THEN container_amount/n ELSE NULL END,container_yield=NULLIF(n,0),stock_after=p.current_stock-u.stock_quantity WHERE id=u.id RETURNING * INTO u;
 IF n=0 THEN
 INSERT INTO public.product_daily_consumption(product_id,consumption_date,quantity_used,unit,professional_id,created_by,account_owner_id,cycle_key,notes) VALUES(p.id,_end_date,u.container_amount,u.container_unit,p.owner_professional_id,auth.uid(),p.account_owner_id,u.cycle_key,'Consumo do ciclo de uso');
 ELSE
 FOR a IN SELECT id,service_id,(start_time AT TIME ZONE tz)::date usage_day FROM public.appointments WHERE id=ANY(ids) ORDER BY start_time,id LOOP
 i:=i+1;
 INSERT INTO public.product_daily_consumption(product_id,consumption_date,quantity_used,unit,professional_id,service_id,appointment_id,created_by,account_owner_id,cycle_key,notes) VALUES(p.id,a.usage_day,base+CASE WHEN i=n THEN leftover ELSE 0 END,u.container_unit,p.owner_professional_id,a.service_id,a.id,auth.uid(),p.account_owner_id,u.cycle_key,'Consumo do ciclo de uso');
 END LOOP;
 END IF;
 INSERT INTO public.product_usage_events(usage_id,product_id,account_owner_id,event_type,old_data,new_data,stock_delta,changed_by) VALUES(u.id,p.id,p.account_owner_id,'usage_finished',old_u,to_jsonb(u),-u.stock_quantity,auth.uid());
 RETURN public.product_usage_result(u.id)||jsonb_build_object('already_finished',false);
END $$;
CREATE OR REPLACE FUNCTION public.finish_product_usage_cycle(_product_id uuid,_purchase_id uuid,_end_date date,_unit text,_appointment_ids uuid[],_appointment_dates date[],_service_ids uuid[] DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u public.product_usage_records;
BEGIN
 SELECT * INTO u FROM public.product_usage_records WHERE product_id=_product_id AND purchase_id=_purchase_id ORDER BY created_at DESC LIMIT 1;
 IF u.id IS NULL THEN RAISE EXCEPTION 'O uso anterior precisa ser conferido antes de registrar o término.'; END IF;
 RETURN public.finish_product_usage_record(u.id,_end_date,u.version);
END $$;
CREATE OR REPLACE FUNCTION public.change_product_usage_record(_usage_id uuid,_expected_version integer,_start_date date,_end_date date,_reason text,_action text DEFAULT 'correct') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products; u public.product_usage_records; old_u jsonb; target_state text; delta numeric:=0; r jsonb;
BEGIN
 SELECT * INTO p FROM public.products WHERE id=(SELECT product_id FROM public.product_usage_records WHERE id=_usage_id) FOR UPDATE;
 IF p.id IS NULL OR auth.uid() IS NULL OR NOT public._can_manage_product_purchase(p) OR NOT public.can_write_record(p.owner_professional_id,'produtos','edit') THEN RAISE EXCEPTION 'Você não tem permissão para corrigir este uso.'; END IF;
 SELECT * INTO u FROM public.product_usage_records WHERE id=_usage_id FOR UPDATE;
 IF u.version IS DISTINCT FROM _expected_version THEN RAISE EXCEPTION 'Este registro foi alterado. Atualize a tela antes de salvar.'; END IF;
 IF NULLIF(btrim(_reason),'') IS NULL THEN RAISE EXCEPTION 'Informe o motivo da alteração.'; END IF;
 IF _action NOT IN ('correct','reopen','cancel') OR u.status='cancelled' THEN RAISE EXCEPTION 'Esta alteração não é permitida para o registro.'; END IF;
 IF _action<>'cancel' AND (_start_date IS NULL OR (_end_date IS NOT NULL AND _end_date<_start_date)) THEN RAISE EXCEPTION 'Informe datas válidas: o término não pode ser anterior ao início.'; END IF;
 IF _action='correct' AND u.status='completed' AND _end_date IS NULL THEN RAISE EXCEPTION 'Para limpar o término, confirme a reabertura do uso.'; END IF;
 IF _action='correct' AND u.status<>'completed' AND _end_date IS NOT NULL THEN RAISE EXCEPTION 'Use a finalização para registrar o término.'; END IF;
 target_state:=CASE WHEN _action='cancel' THEN 'cancelled' ELSE 'in_use' END;
 IF target_state='in_use' AND EXISTS(SELECT 1 FROM public.product_usage_records WHERE product_id=p.id AND id<>u.id AND status IN ('planned','in_use')) THEN RAISE EXCEPTION 'Encerre o ciclo ativo antes de reabrir este registro.'; END IF;
 old_u:=to_jsonb(u);
 IF u.status='completed' THEN
 delta:=u.stock_quantity;
 DELETE FROM public.product_daily_consumption WHERE product_id=p.id AND cycle_key=u.cycle_key;
 UPDATE public.products SET current_stock=current_stock+delta,updated_by=auth.uid() WHERE id=p.id;
 END IF;
 UPDATE public.product_usage_records SET start_date=CASE WHEN _action='cancel' THEN start_date ELSE _start_date END,end_date=NULL,status=target_state,cancellation_reason=CASE WHEN _action='cancel' THEN _reason ELSE NULL END,appointments_counted=0,appointment_ids=ARRAY[]::uuid[],avg_quantity_per_appointment=NULL,total_consumed=NULL,container_yield=NULL,stock_after=NULL WHERE id=u.id RETURNING * INTO u;
 IF _action='correct' AND _end_date IS NOT NULL THEN
 r:=public.finish_product_usage_record(u.id,_end_date,u.version);
 ELSE r:=public.product_usage_result(u.id); END IF;
 INSERT INTO public.product_usage_events(usage_id,product_id,account_owner_id,event_type,old_data,new_data,stock_delta,reason,changed_by) VALUES(u.id,p.id,p.account_owner_id,CASE WHEN _action='cancel' THEN 'usage_cancelled' ELSE 'usage_corrected' END,old_u,r,delta,_reason,auth.uid());
 RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.adjust_product_stock_audited(_product_id uuid,_expected_stock numeric,_new_stock numeric,_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products;
BEGIN
 SELECT * INTO p FROM public.products WHERE id=_product_id FOR UPDATE;
 IF p.id IS NULL OR auth.uid() IS NULL OR NOT public._can_manage_product_purchase(p) OR NOT public.can_write_record(p.owner_professional_id,'produtos','edit') THEN RAISE EXCEPTION 'Você não tem permissão para ajustar este estoque.'; END IF;
 IF p.current_stock IS DISTINCT FROM _expected_stock THEN RAISE EXCEPTION 'O estoque foi alterado. Atualize a tela antes de salvar.'; END IF;
 IF _new_stock IS NULL OR _new_stock<0 OR NULLIF(btrim(_reason),'') IS NULL THEN RAISE EXCEPTION 'Informe estoque válido e o motivo do ajuste.'; END IF;
 IF EXISTS(SELECT 1 FROM public.product_usage_records WHERE product_id=p.id AND status='in_use' AND stock_quantity>_new_stock) THEN RAISE EXCEPTION 'O estoque não pode ficar menor que a quantidade em uso. Confira o ciclo antes de ajustar.'; END IF;
 UPDATE public.products SET current_stock=_new_stock,updated_by=auth.uid() WHERE id=p.id;
 INSERT INTO public.product_usage_events(product_id,account_owner_id,event_type,old_data,new_data,stock_delta,reason,changed_by) VALUES(p.id,p.account_owner_id,'stock_adjusted',jsonb_build_object('stock',p.current_stock),jsonb_build_object('stock',_new_stock),_new_stock-p.current_stock,_reason,auth.uid());
 RETURN jsonb_build_object('stock',_new_stock);
END $$;
CREATE OR REPLACE FUNCTION public.protect_used_purchase_delete() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF OLD.started_using_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.product_usage_records WHERE purchase_id=OLD.id) THEN RAISE EXCEPTION 'Esta compra possui um registro de uso. Preserve o histórico e corrija o ciclo ou registre um ajuste de estoque.'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER protect_used_purchase BEFORE DELETE ON public.product_purchases FOR EACH ROW EXECUTE FUNCTION public.protect_used_purchase_delete();
CREATE OR REPLACE FUNCTION public.guard_product_usage_mirror() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u public.product_usage_records;
BEGIN
 IF NEW.started_using_at IS NOT DISTINCT FROM OLD.started_using_at AND NEW.finished_at IS NOT DISTINCT FROM OLD.finished_at AND NEW.cycle_quantity IS NOT DISTINCT FROM OLD.cycle_quantity AND NEW.cycle_unit IS NOT DISTINCT FROM OLD.cycle_unit THEN RETURN NEW; END IF;
 SELECT * INTO u FROM public.product_usage_records WHERE product_id=NEW.id AND status IN ('planned','in_use') ORDER BY created_at DESC LIMIT 1;
 IF u.id IS NULL THEN SELECT * INTO u FROM public.product_usage_records WHERE product_id=NEW.id ORDER BY updated_at DESC LIMIT 1; END IF;
 IF u.id IS NULL OR NEW.started_using_at IS DISTINCT FROM (CASE WHEN u.status='cancelled' THEN NULL ELSE u.start_date END) OR NEW.finished_at IS DISTINCT FROM (CASE WHEN u.status='completed' THEN u.end_date ELSE NULL END) OR NEW.cycle_quantity IS DISTINCT FROM (CASE WHEN u.status='in_use' THEN u.stock_quantity ELSE NULL END) OR NEW.cycle_unit IS DISTINCT FROM (CASE WHEN u.status='in_use' THEN u.container_unit ELSE NULL END) THEN RAISE EXCEPTION 'As datas pertencem ao registro de uso. Faça a alteração pelo ciclo do produto.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_product_usage_mirror BEFORE UPDATE OF started_using_at,finished_at,cycle_quantity,cycle_unit ON public.products FOR EACH ROW EXECUTE FUNCTION public.guard_product_usage_mirror();
REVOKE ALL ON FUNCTION public.create_product_usage_plan(uuid,numeric,text,uuid),public.activate_product_usage(uuid,date,integer),public.start_product_usage_cycle(uuid,date,numeric,text,uuid),public.finish_product_usage_record(uuid,date,integer),public.finish_product_usage_cycle(uuid,uuid,date,text,uuid[],date[],uuid[]),public.change_product_usage_record(uuid,integer,date,date,text,text),public.adjust_product_stock_audited(uuid,numeric,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_product_usage_plan(uuid,numeric,text,uuid),public.activate_product_usage(uuid,date,integer),public.start_product_usage_cycle(uuid,date,numeric,text,uuid),public.finish_product_usage_record(uuid,date,integer),public.finish_product_usage_cycle(uuid,uuid,date,text,uuid[],date[],uuid[]),public.change_product_usage_record(uuid,integer,date,date,text,text),public.adjust_product_stock_audited(uuid,numeric,numeric,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.validate_product_usage_record(),public.mirror_product_usage(),public.protect_used_purchase_delete(),public.guard_product_usage_mirror() FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='product_usage_records') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.product_usage_records; END IF; IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='product_usage_events') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.product_usage_events; END IF; END $$;
ALTER TABLE public.product_usage_records REPLICA IDENTITY FULL;
ALTER TABLE public.product_usage_events REPLICA IDENTITY FULL;