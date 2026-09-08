CREATE OR REPLACE FUNCTION public.professional_permission(_key text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE((p.permissions ->> _key)::boolean, false)
  FROM public.professionals p
  WHERE p.id = public.get_professional_id_by_user_or_email(auth.uid())
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.can_use_financial_module()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_account_admin(auth.uid())
     OR public.has_role(auth.uid(), 'receptionist')
     OR public.professional_permission('can_access_financial')
     OR public.professional_permission('can_manage_own_register')
     OR public.professional_permission('can_open_close_register')
     OR public.professional_permission('can_manage_payments');
$function$;