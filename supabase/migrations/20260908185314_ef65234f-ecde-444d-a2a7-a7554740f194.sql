-- 1) Contagem de assentos ignora perfis órfãos (sem profissional e sem papel de acesso)
CREATE OR REPLACE FUNCTION public.count_account_seats(_owner uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::int FROM public.profiles p
  WHERE p.is_active = true
    AND (
      p.id = _owner
      OR (
        p.account_owner_id = _owner
        AND (
          EXISTS (SELECT 1 FROM public.professionals pr WHERE pr.user_id = p.id)
          OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
        )
      )
    );
$function$;

-- 2) Desativa o perfil órfão quando um profissional é removido
CREATE OR REPLACE FUNCTION public.deactivate_orphan_profile_after_professional_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.user_id IS NULL THEN
    RETURN OLD;
  END IF;

  UPDATE public.profiles p
     SET is_active = false,
         deactivated_at = COALESCE(p.deactivated_at, now())
   WHERE p.id = OLD.user_id
     AND p.is_active = true
     AND p.account_owner_id IS DISTINCT FROM p.id
     AND NOT EXISTS (SELECT 1 FROM public.professionals pr WHERE pr.user_id = OLD.user_id)
     AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = OLD.user_id);

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_deactivate_orphan_profile_after_professional_delete ON public.professionals;
CREATE TRIGGER trg_deactivate_orphan_profile_after_professional_delete
AFTER DELETE ON public.professionals
FOR EACH ROW EXECUTE FUNCTION public.deactivate_orphan_profile_after_professional_delete();

-- 3) Ferramenta de reconciliação manual (apenas administradores da conta)
CREATE OR REPLACE FUNCTION public.reconcile_account_seats(_owner uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_freed int;
BEGIN
  v_owner := COALESCE(_owner, public.get_account_owner(auth.uid()));
  IF v_owner IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Apenas administradores podem revisar os usuários da conta.';
  END IF;

  IF _owner IS NOT NULL
     AND _owner <> public.get_account_owner(auth.uid())
     AND NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem revisar os usuários da conta.';
  END IF;

  WITH freed AS (
    UPDATE public.profiles p
       SET is_active = false,
           deactivated_at = COALESCE(p.deactivated_at, now())
     WHERE p.account_owner_id = v_owner
       AND p.id <> v_owner
       AND p.is_active = true
       AND NOT EXISTS (SELECT 1 FROM public.professionals pr WHERE pr.user_id = p.id)
       AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
     RETURNING p.id
  )
  SELECT COUNT(*)::int INTO v_freed FROM freed;

  RETURN COALESCE(v_freed, 0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reconcile_account_seats(uuid) TO authenticated;

-- 4) Limpeza dos órfãos existentes
UPDATE public.profiles p
   SET is_active = false,
       deactivated_at = COALESCE(p.deactivated_at, now())
 WHERE p.is_active = true
   AND p.account_owner_id IS NOT NULL
   AND p.account_owner_id <> p.id
   AND NOT EXISTS (SELECT 1 FROM public.professionals pr WHERE pr.user_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id);