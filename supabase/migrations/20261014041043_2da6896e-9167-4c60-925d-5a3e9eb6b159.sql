-- Rollback: drop cash_authority_guard trigger/function and create_cash_transaction_atomic(jsonb,uuid); remove request_id after usage review.
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS cash_transactions_request_unique ON public.cash_transactions(created_by,request_id) WHERE request_id IS NOT NULL;
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
   IF NOT FOUND OR v_register.account_owner_id IS DISTINCT FROM NEW.account_owner_id THEN RAISE EXCEPTION 'Caixa não disponível para esta conta.' USING ERRCODE='42501'; END IF;
   IF v_register.status<>'open' THEN RAISE EXCEPTION 'O caixa está fechado. Abra o caixa antes de registrar a movimentação.'; END IF;
   NEW.professional_id:=v_register.professional_id;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_cash_transaction_authority() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER cash_authority_guard BEFORE INSERT ON public.cash_transactions FOR EACH ROW EXECUTE FUNCTION public.guard_cash_transaction_authority();
CREATE OR REPLACE FUNCTION public.create_cash_transaction_atomic(_transaction jsonb,_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_user uuid:=auth.uid(); v_row public.cash_transactions%rowtype;
BEGIN
 IF v_user IS NULL OR _request_id IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para registrar a movimentação.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text||_request_id::text,0));
 SELECT * INTO v_row FROM public.cash_transactions WHERE created_by=v_user AND request_id=_request_id;
 IF FOUND THEN RETURN to_jsonb(v_row); END IF;
 INSERT INTO public.cash_transactions(cash_register_id,type,category,description,amount,payment_method,bank_id,reference_id,reference_type,created_by,account_owner_id,card_fee_amount,installments,request_id)
 VALUES(nullif(_transaction->>'cash_register_id','')::uuid,_transaction->>'type',_transaction->>'category',_transaction->>'description',(_transaction->>'amount')::numeric,_transaction->>'payment_method',nullif(_transaction->>'bank_id','')::uuid,nullif(_transaction->>'reference_id','')::uuid,_transaction->>'reference_type',v_user,public.current_account_owner_id(),greatest(coalesce((_transaction->>'card_fee_amount')::numeric,0),0),greatest(coalesce((_transaction->>'installments')::integer,1),1),_request_id) RETURNING * INTO v_row;
 RETURN to_jsonb(v_row);
END; $$;
REVOKE ALL ON FUNCTION public.create_cash_transaction_atomic(jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_cash_transaction_atomic(jsonb,uuid) TO authenticated,service_role;