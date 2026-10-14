ALTER TABLE public.appointments ADD COLUMN booking_origin text;
CREATE OR REPLACE FUNCTION public.guard_appointment_package_origin() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ DECLARE p record; BEGIN
 IF TG_OP='INSERT' THEN NEW.booking_origin:=CASE WHEN NEW.package_appointment_id IS NULL THEN 'standalone' ELSE 'package' END;
 ELSE
 IF NEW.booking_origin IS DISTINCT FROM OLD.booking_origin THEN RAISE EXCEPTION 'A origem do atendimento não pode ser alterada.'; END IF;
 IF COALESCE(OLD.booking_origin,CASE WHEN OLD.package_appointment_id IS NULL THEN 'standalone' ELSE 'package' END)='standalone' AND NEW.package_appointment_id IS NOT NULL THEN RAISE EXCEPTION 'Atendimento avulso não pode ser transformado em etapa de pacote.'; END IF;
 END IF;
 IF NEW.package_appointment_id IS NOT NULL THEN
 SELECT pa.appointment_id,sp.client_id,sp.account_owner_id INTO p FROM public.package_appointments pa JOIN public.service_packages sp ON sp.id=pa.package_id WHERE pa.id=NEW.package_appointment_id FOR UPDATE OF pa;
 IF NOT FOUND OR p.client_id IS DISTINCT FROM NEW.client_id OR (p.appointment_id IS NOT NULL AND p.appointment_id<>NEW.id) THEN RAISE EXCEPTION 'A etapa não corresponde a este atendimento.'; END IF;
 IF TG_OP='UPDATE' AND OLD.package_appointment_id IS NOT NULL AND NEW.package_appointment_id<>OLD.package_appointment_id THEN RAISE EXCEPTION 'O atendimento não pode trocar de etapa.'; END IF;
 END IF; RETURN NEW; END $$;
CREATE TRIGGER zz_guard_appointment_package_origin BEFORE INSERT OR UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.guard_appointment_package_origin();
REVOKE ALL ON FUNCTION public.guard_appointment_package_origin() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.guard_package_reverse_link() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ DECLARE a record; BEGIN
 IF NEW.appointment_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.appointment_id IS DISTINCT FROM OLD.appointment_id) THEN
 SELECT client_id,package_appointment_id,booking_origin INTO a FROM public.appointments WHERE id=NEW.appointment_id FOR UPDATE;
 IF NOT FOUND OR a.package_appointment_id IS DISTINCT FROM NEW.id THEN RAISE EXCEPTION 'A etapa precisa do vínculo explícito de um atendimento de pacote.'; END IF;
 END IF; RETURN NEW; END $$;
CREATE TRIGGER zz_guard_package_reverse_link BEFORE INSERT OR UPDATE OF appointment_id ON public.package_appointments FOR EACH ROW EXECUTE FUNCTION public.guard_package_reverse_link();
REVOKE ALL ON FUNCTION public.guard_package_reverse_link() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.find_package_session_for_appointment(p_appointment_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT a.package_appointment_id FROM public.appointments a WHERE a.id=p_appointment_id AND public.can_see_appointment_row(a.id) $$;
DO $patch$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.schedule_package_sessions_batch(uuid,uuid,jsonb,uuid)'::regprocedure) INTO d;
 d:=replace(d,'discount_amount, created_by, updated_by','discount_amount, created_by, updated_by, package_appointment_id');
 d:=replace(d,'auth.uid(),
      auth.uid()
    )','auth.uid(),
      auth.uid(), v_pa.id
    )');
 IF d NOT LIKE '%auth.uid(), v_pa.id%' THEN RAISE EXCEPTION 'Batch patch did not match'; END IF; EXECUTE d;
 SELECT pg_get_functiondef('public.link_package_session_to_appointment(uuid,uuid,uuid)'::regprocedure) INTO d;
 d:=replace(d,'PERFORM public.heal_package_service_links(_package_id);',$s$IF _package_appointment_id IS NULL OR v_appt.package_appointment_id IS DISTINCT FROM _package_appointment_id THEN RAISE EXCEPTION 'Atendimento avulso não pode ser vinculado ao pacote; crie uma nova etapa.'; END IF;
 PERFORM public.heal_package_service_links(_package_id);$s$); EXECUTE d;
 SELECT pg_get_functiondef('public.autoheal_package_schedule(uuid)'::regprocedure) INTO d;
 d:=replace(d,'WHERE a.package_appointment_id IS NULL','WHERE false AND a.package_appointment_id IS NULL'); EXECUTE d;
 SELECT pg_get_functiondef('public.heal_client_package_appointments(uuid)'::regprocedure) INTO d;
 d:=replace(d,'AND a.package_appointment_id IS NULL','AND false AND a.package_appointment_id IS NULL'); EXECUTE d;
END $patch$;