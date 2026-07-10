
-- 1) Cross-tenant integrity: um agendamento nunca pode referenciar cliente/profissional/serviço de outra conta.
CREATE OR REPLACE FUNCTION public.tg_appointments_enforce_same_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_owner uuid;
  v_prof_owner uuid;
  v_service_owner uuid;
BEGIN
  IF NEW.client_id IS NOT NULL THEN
    SELECT account_owner_id INTO v_client_owner FROM public.clients WHERE id = NEW.client_id;
    IF v_client_owner IS NOT NULL AND v_client_owner <> NEW.account_owner_id THEN
      RAISE EXCEPTION 'Cliente pertence a outra conta. Operação bloqueada por isolamento entre cadastros.' USING ERRCODE='42501';
    END IF;
  END IF;
  IF NEW.professional_id IS NOT NULL THEN
    SELECT account_owner_id INTO v_prof_owner FROM public.professionals WHERE id = NEW.professional_id;
    IF v_prof_owner IS NOT NULL AND v_prof_owner <> NEW.account_owner_id THEN
      RAISE EXCEPTION 'Profissional pertence a outra conta. Operação bloqueada por isolamento entre cadastros.' USING ERRCODE='42501';
    END IF;
  END IF;
  IF NEW.service_id IS NOT NULL THEN
    SELECT account_owner_id INTO v_service_owner FROM public.services WHERE id = NEW.service_id;
    IF v_service_owner IS NOT NULL AND v_service_owner <> NEW.account_owner_id THEN
      RAISE EXCEPTION 'Serviço pertence a outra conta. Operação bloqueada por isolamento entre cadastros.' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_enforce_same_tenant ON public.appointments;
CREATE TRIGGER trg_appointments_enforce_same_tenant
BEFORE INSERT OR UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.tg_appointments_enforce_same_tenant();

-- 2) RPC para o administrador da conta apagar dados de teste da PRÓPRIA conta.
--    Não permite tocar em outra conta (usa sempre current_account_owner_id).
CREATE OR REPLACE FUNCTION public.purge_my_account_test_data(_before_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid := public.current_account_owner_id();
  v_deleted_clients int := 0;
  v_deleted_services int := 0;
  v_deleted_appointments int := 0;
  v_deleted_financial int := 0;
  v_cutoff timestamptz;
BEGIN
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Apenas o administrador da própria conta pode limpar dados.' USING ERRCODE='42501';
  END IF;
  v_cutoff := COALESCE(_before_date::timestamptz, now());

  DELETE FROM public.appointments WHERE account_owner_id = v_owner AND created_at < v_cutoff;
  GET DIAGNOSTICS v_deleted_appointments = ROW_COUNT;
  DELETE FROM public.financial_entries WHERE account_owner_id = v_owner AND created_at < v_cutoff;
  GET DIAGNOSTICS v_deleted_financial = ROW_COUNT;
  DELETE FROM public.services WHERE account_owner_id = v_owner AND created_at < v_cutoff;
  GET DIAGNOSTICS v_deleted_services = ROW_COUNT;
  DELETE FROM public.clients WHERE account_owner_id = v_owner AND created_at < v_cutoff;
  GET DIAGNOSTICS v_deleted_clients = ROW_COUNT;

  RETURN jsonb_build_object(
    'account_owner_id', v_owner,
    'cutoff', v_cutoff,
    'deleted', jsonb_build_object(
      'appointments', v_deleted_appointments,
      'financial_entries', v_deleted_financial,
      'services', v_deleted_services,
      'clients', v_deleted_clients
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_my_account_test_data(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_my_account_test_data(date) TO authenticated;
