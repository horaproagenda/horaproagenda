CREATE OR REPLACE FUNCTION public.can_see_record(_owner uuid, _visibility data_visibility, _module text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE mine uuid; scope text;
BEGIN
  IF public.is_super_admin(auth.uid()) THEN RETURN true; END IF;
  IF _owner IS NULL THEN RETURN true; END IF;

  mine := public.get_professional_id_for_user(auth.uid());
  IF mine IS NOT NULL AND mine = _owner THEN RETURN true; END IF;

  -- "Geral da clínica" é uma escolha explícita do criador: toda a equipe vê.
  IF coalesce(_visibility, 'clinic') = 'clinic' THEN RETURN true; END IF;

  IF NOT public.professional_share_flag(_owner, _module) THEN
    RETURN false;
  END IF;

  IF public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(), 'receptionist') THEN
    RETURN true;
  END IF;

  scope := public.perm_scope(_module);
  RETURN CASE _visibility
    WHEN 'private' THEN false
    WHEN 'shared'  THEN scope IN ('shared','unit','all') OR public.perm(_module, 'view_others')
    ELSE true
  END;
END;
$function$;