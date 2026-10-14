CREATE OR REPLACE FUNCTION public.refresh_package_display_sequence() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE p uuid; BEGIN
 p:=CASE WHEN TG_OP='DELETE' THEN OLD.package_id ELSE NEW.package_id END;
 IF NOT EXISTS(SELECT 1 FROM public.package_appointments WHERE package_id=p AND display_session_number IS NOT NULL) THEN RETURN COALESCE(NEW,OLD); END IF;
 WITH ordered AS (SELECT pa.id,row_number() OVER(ORDER BY (pa.appointment_id IS NULL),a.start_time NULLS LAST,pa.original_session_number,pa.id)::int n FROM public.package_appointments pa LEFT JOIN public.appointments a ON a.id=pa.appointment_id WHERE pa.package_id=p)
 UPDATE public.package_appointments pa SET display_session_number=o.n FROM ordered o WHERE pa.id=o.id AND pa.display_session_number IS DISTINCT FROM o.n;
 RETURN COALESCE(NEW,OLD); END $$;
REVOKE ALL ON FUNCTION public.refresh_package_display_sequence() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER refresh_package_display_sequence AFTER INSERT OR DELETE OR UPDATE OF appointment_id,scheduled_date,status ON public.package_appointments FOR EACH ROW EXECUTE FUNCTION public.refresh_package_display_sequence();
DO $patch$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.guard_appointment_package_origin()'::regprocedure) INTO d;
 d:=replace(d,'IF NOT FOUND OR p.client_id IS DISTINCT FROM NEW.client_id OR', 'IF NOT FOUND OR p.account_owner_id IS DISTINCT FROM NEW.account_owner_id OR p.client_id IS DISTINCT FROM NEW.client_id OR');
 d:=replace(d,'END IF; RETURN NEW; END', $s$END IF;
 IF NEW.package_appointment_id IS NULL THEN NEW.package_name_snapshot:=NULL; END IF;
 RETURN NEW; END$s$); EXECUTE d;
END $patch$;
CREATE OR REPLACE FUNCTION public.repair_client_package_schedule_and_history(_client_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r record; n int:=0; BEGIN
 IF _client_id IS NULL THEN RAISE EXCEPTION 'Informe um cliente para conferir os pacotes.'; END IF;
 FOR r IN SELECT id FROM public.service_packages WHERE client_id=_client_id AND is_active LOOP
 IF public.can_access_service_package(r.id) THEN PERFORM public.autoheal_package_schedule(r.id); n:=n+1; END IF;
 END LOOP;
 RETURN jsonb_build_object('relinkedAppointments',0,'rebuiltPackages',n,'rescheduledSessions',0); END $$;