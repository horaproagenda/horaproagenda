
-- 1. Flag de compartilhamento por profissional (armazenada em professionals.permissions)
CREATE OR REPLACE FUNCTION public.professional_share_flag(_owner uuid, _module text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE perms jsonb; k text;
BEGIN
  IF _owner IS NULL THEN RETURN true; END IF;
  k := CASE _module
    WHEN 'clientes'   THEN 'can_share_clients_with_admin'
    WHEN 'servicos'   THEN 'can_share_services_with_admin'
    WHEN 'documentos' THEN 'can_share_documents_with_admin'
    WHEN 'financeiro' THEN 'can_share_financial_with_admin'
    ELSE NULL END;
  IF k IS NULL THEN RETURN true; END IF;

  SELECT coalesce(p.permissions, '{}'::jsonb) INTO perms
    FROM public.professionals p WHERE p.id = _owner;

  IF perms IS NULL OR NOT (perms ? k) THEN
    -- Compatibilidade: sem a opção configurada, mantém o comportamento antigo
    RETURN CASE WHEN _module = 'financeiro' THEN false ELSE true END;
  END IF;
  RETURN coalesce((perms ->> k)::boolean, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.professional_share_flag(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.professional_share_flag(uuid, text) TO authenticated;

-- 2. Visibilidade: respeitar o compartilhamento do profissional dono do registro
CREATE OR REPLACE FUNCTION public.can_see_record(_owner uuid, _visibility public.data_visibility, _module text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE mine uuid; scope text;
BEGIN
  IF public.is_super_admin(auth.uid()) THEN RETURN true; END IF;
  IF _owner IS NULL THEN RETURN true; END IF;

  mine := public.get_professional_id_for_user(auth.uid());
  IF mine IS NOT NULL AND mine = _owner THEN RETURN true; END IF;

  IF NOT public.professional_share_flag(_owner, _module) THEN
    RETURN false;
  END IF;

  IF public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(), 'receptionist') THEN
    RETURN true;
  END IF;

  scope := public.perm_scope(_module);
  RETURN CASE coalesce(_visibility, 'clinic')
    WHEN 'private' THEN false
    WHEN 'shared'  THEN scope IN ('shared','unit','all') OR public.perm(_module, 'view_others')
    ELSE scope <> 'own' OR public.perm(_module, 'view_others')
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_write_record(_owner uuid, _module text, _action text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE mine uuid;
BEGIN
  mine := public.get_professional_id_for_user(auth.uid());
  IF _owner IS NOT NULL AND (mine IS NULL OR mine <> _owner)
     AND NOT public.is_super_admin(auth.uid())
     AND NOT public.professional_share_flag(_owner, _module) THEN
    RETURN false;
  END IF;

  IF public.is_account_admin(auth.uid()) THEN RETURN true; END IF;
  IF _owner IS NULL OR mine IS NULL OR mine <> _owner THEN
    RETURN public.perm(_module, _action || '_others');
  END IF;
  RETURN public.perm(_module, _action);
END;
$$;

-- 3. Contas do financeiro criadas pelo profissional ficam privadas dele
CREATE OR REPLACE FUNCTION public.can_see_financial_entry(_created_by uuid, _appointment_id uuid, _sale_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_prof uuid;
BEGIN
  IF _created_by IS NULL OR _created_by = auth.uid() THEN RETURN true; END IF;
  -- Lançamentos vindos de atendimento ou venda pertencem ao caixa da clínica
  IF _appointment_id IS NOT NULL OR _sale_id IS NOT NULL THEN RETURN true; END IF;

  SELECT p.id INTO owner_prof FROM public.professionals p WHERE p.user_id = _created_by LIMIT 1;
  IF owner_prof IS NULL THEN RETURN true; END IF;
  IF public.is_account_admin(_created_by) THEN RETURN true; END IF;

  RETURN public.professional_share_flag(owner_prof, 'financeiro');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_see_financial_entry(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_see_financial_entry(uuid, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS financial_privacy_select ON public.financial_entries;
CREATE POLICY financial_privacy_select ON public.financial_entries
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.can_see_financial_entry(created_by, appointment_id, sale_id));

-- 4. Caixa: profissional com acesso ao financeiro usa o caixa da clínica
DROP POLICY IF EXISTS "Professionals with financial access can view cash registers" ON public.cash_registers;
CREATE POLICY "Professionals with financial access can view cash registers" ON public.cash_registers
  FOR SELECT TO authenticated
  USING (public.professional_permission('can_access_financial'));

DROP POLICY IF EXISTS "Professionals can open cash registers" ON public.cash_registers;
CREATE POLICY "Professionals can open cash registers" ON public.cash_registers
  FOR INSERT TO authenticated
  WITH CHECK (public.professional_permission('can_open_close_register'));

DROP POLICY IF EXISTS "Professionals can update cash registers" ON public.cash_registers;
CREATE POLICY "Professionals can update cash registers" ON public.cash_registers
  FOR UPDATE TO authenticated
  USING (public.professional_permission('can_open_close_register'))
  WITH CHECK (public.professional_permission('can_open_close_register'));

-- 5. Baixas de pagamento do profissional entram no caixa principal
DROP POLICY IF EXISTS "Professionals with payments permission can view cash tx" ON public.cash_transactions;
CREATE POLICY "Professionals with payments permission can view cash tx" ON public.cash_transactions
  FOR SELECT TO authenticated
  USING (public.professional_permission('can_access_financial'));

DROP POLICY IF EXISTS "Professionals with payments permission can insert cash tx" ON public.cash_transactions;
CREATE POLICY "Professionals with payments permission can insert cash tx" ON public.cash_transactions
  FOR INSERT TO authenticated
  WITH CHECK (public.professional_permission('can_manage_payments'));

DROP POLICY IF EXISTS "Professionals with payments permission can update cash tx" ON public.cash_transactions;
CREATE POLICY "Professionals with payments permission can update cash tx" ON public.cash_transactions
  FOR UPDATE TO authenticated
  USING (public.professional_permission('can_manage_payments'))
  WITH CHECK (public.professional_permission('can_manage_payments'));
