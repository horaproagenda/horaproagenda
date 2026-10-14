-- Rollback: drop business_settings_authority_guard trigger and guard_business_settings_authority().
CREATE OR REPLACE FUNCTION public.guard_business_settings_authority() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' AND auth.uid() IS NOT NULL THEN NEW.account_owner_id:=public.current_account_owner_id(); END IF;
 IF TG_OP='UPDATE' AND NEW.account_owner_id IS DISTINCT FROM OLD.account_owner_id THEN RAISE EXCEPTION 'Não é possível transferir configurações entre contas.' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' OR NEW.timezone IS DISTINCT FROM OLD.timezone THEN
   IF NEW.timezone IS NULL OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.timezone) THEN RAISE EXCEPTION 'Escolha um fuso horário válido.'; END IF;
 END IF;
 IF TG_OP='INSERT' OR NEW.slot_interval IS DISTINCT FROM OLD.slot_interval THEN
   IF NEW.slot_interval IS NULL OR NEW.slot_interval<=0 THEN RAISE EXCEPTION 'Informe um intervalo positivo para a agenda.'; END IF;
 END IF;
 IF TG_OP='INSERT' OR NEW.opening_time IS DISTINCT FROM OLD.opening_time OR NEW.closing_time IS DISTINCT FROM OLD.closing_time THEN
   IF NEW.opening_time IS NULL OR NEW.closing_time IS NULL OR NEW.closing_time<=NEW.opening_time THEN RAISE EXCEPTION 'O encerramento deve ser posterior à abertura.'; END IF;
 END IF;
 IF TG_OP='INSERT' OR NEW.overdue_days_threshold IS DISTINCT FROM OLD.overdue_days_threshold THEN
   IF NEW.overdue_days_threshold IS NOT NULL AND NEW.overdue_days_threshold<0 THEN RAISE EXCEPTION 'O prazo de atraso não pode ser negativo.'; END IF;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_business_settings_authority() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER business_settings_authority_guard BEFORE INSERT OR UPDATE ON public.business_settings FOR EACH ROW EXECUTE FUNCTION public.guard_business_settings_authority();