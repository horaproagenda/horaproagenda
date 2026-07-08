
-- 1) Corrige unicidade global do nome (era global) para por-tenant
ALTER TABLE public.payment_methods DROP CONSTRAINT IF EXISTS payment_methods_name_unique;
CREATE UNIQUE INDEX IF NOT EXISTS payment_methods_owner_name_unique
  ON public.payment_methods (account_owner_id, lower(name));

-- 2) Função de seed reutilizável
CREATE OR REPLACE FUNCTION public.seed_default_payment_methods(_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.payment_methods (name, description, is_active, max_installments, card_fee, debit_fee, installment_fee, account_owner_id)
  VALUES
    ('Dinheiro',              'Pagamento em espécie',                                 true, 1,  0, 0, 0, _owner_id),
    ('PIX',                   'Transferência instantânea via PIX',                    true, 1,  0, 0, 0, _owner_id),
    ('Cartão de Crédito',     'Cartão de crédito (bandeira, taxa e parcelas na venda)', true, 12, 0, 0, 0, _owner_id),
    ('Cartão de Débito',      'Cartão de débito (bandeira e taxa na venda)',          true, 1,  0, 0, 0, _owner_id),
    ('Boleto Bancário',       'Cobrança via boleto (parcelável)',                     true, 12, 0, 0, 0, _owner_id),
    ('Cheque',                'Pagamento via cheque',                                 true, 1,  0, 0, 0, _owner_id),
    ('Transferência Bancária','TED/DOC/Transferência bancária',                       true, 1,  0, 0, 0, _owner_id),
    ('Crédito ao Cliente',    'Uso de saldo de crédito do cliente (sem entrada no caixa)', true, 1, 0, 0, 0, _owner_id),
    ('Outros',                'Outras formas de pagamento',                           true, 1,  0, 0, 0, _owner_id)
  ON CONFLICT (account_owner_id, lower(name)) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_default_payment_methods(uuid) FROM PUBLIC, anon, authenticated;

-- 3) Atualiza handle_new_user para semear formas de pagamento padrão
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, account_owner_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    NEW.email,
    NEW.id
  )
  ON CONFLICT (id) DO NOTHING;

  -- Semeia formas de pagamento padrão apenas para o dono da conta (account_owner_id = id do próprio usuário)
  PERFORM public.seed_default_payment_methods(NEW.id);

  RETURN NEW;
END;
$$;

-- 4) Backfill: para contas existentes sem nenhuma forma de pagamento
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.id AS owner_id
    FROM public.profiles p
    WHERE p.account_owner_id = p.id
      AND NOT EXISTS (
        SELECT 1 FROM public.payment_methods pm WHERE pm.account_owner_id = p.id
      )
  LOOP
    PERFORM public.seed_default_payment_methods(r.owner_id);
  END LOOP;
END $$;
