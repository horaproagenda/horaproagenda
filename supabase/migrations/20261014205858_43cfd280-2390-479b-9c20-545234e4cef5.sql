CREATE OR REPLACE FUNCTION public.guard_cash_transaction_authority() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_register public.cash_registers%rowtype;
BEGIN
 IF NEW.amount IS NULL OR NEW.amount<=0 OR NEW.amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Informe um valor positivo para a movimentação.'; END IF;
 IF NEW.type NOT IN ('income','expense') OR nullif(trim(NEW.category),'') IS NULL THEN RAISE EXCEPTION 'Confira o tipo e a categoria da movimentação.'; END IF;
 IF auth.uid() IS NOT NULL THEN
   NEW.created_by:=auth.uid(); NEW.account_owner_id:=public.current_account_owner_id();
 END IF;
 IF NEW.cash_register_id IS NOT NULL THEN
   SELECT * INTO v_register FROM public.cash_registers WHERE id=NEW.cash_register_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Caixa não disponível para esta conta.' USING ERRCODE='42501'; END IF;
   -- Gravação pelo servidor (sem usuário na sessão): conta vem do próprio caixa.
   IF auth.uid() IS NULL AND NEW.account_owner_id IS NULL THEN NEW.account_owner_id:=v_register.account_owner_id; END IF;
   IF v_register.account_owner_id IS DISTINCT FROM NEW.account_owner_id THEN RAISE EXCEPTION 'Caixa não disponível para esta conta.' USING ERRCODE='42501'; END IF;
   IF v_register.status<>'open' THEN RAISE EXCEPTION 'O caixa está fechado. Abra o caixa antes de registrar a movimentação.'; END IF;
   NEW.professional_id:=v_register.professional_id;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_cash_transaction_authority() FROM PUBLIC,anon,authenticated;