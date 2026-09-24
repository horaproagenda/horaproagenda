CREATE OR REPLACE FUNCTION public.resolve_financial_destination(p_professional_id uuid DEFAULT NULL, p_owner uuid DEFAULT NULL)
RETURNS TABLE(employment_type text, professional_id uuid, financial_account_id uuid, cash_register_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid;
  v_type text;
  v_prof uuid;
BEGIN
  v_owner := public.get_user_account_owner_id(auth.uid());
  IF v_owner IS NULL AND auth.role() = 'service_role' THEN
    v_owner := p_owner;
  END IF;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Sem permissão para registrar este lançamento.' USING ERRCODE = 'P0001';
  END IF;

  IF p_professional_id IS NOT NULL THEN
    SELECT p.employment_type::text INTO v_type
    FROM public.professionals p
    WHERE p.id = p_professional_id AND p.account_owner_id = v_owner;
  END IF;

  -- Só o profissional independente tem conta e caixa próprios.
  v_prof := CASE WHEN v_type = 'independente' THEN p_professional_id ELSE NULL END;

  RETURN QUERY
  SELECT v_type,
         v_prof,
         (SELECT fa.id FROM public.financial_accounts fa
            WHERE fa.account_owner_id = v_owner
              AND fa.professional_id IS NOT DISTINCT FROM v_prof
            ORDER BY fa.is_active DESC LIMIT 1),
         (SELECT cr.id FROM public.cash_registers cr
            WHERE cr.account_owner_id = v_owner
              AND cr.professional_id IS NOT DISTINCT FROM v_prof
              AND cr.status = 'open'
            ORDER BY cr.opened_at DESC LIMIT 1);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_financial_destination(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_financial_destination(uuid, uuid) TO authenticated, service_role;