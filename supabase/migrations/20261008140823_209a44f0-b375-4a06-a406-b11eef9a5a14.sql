CREATE OR REPLACE FUNCTION public.get_user_account_owner_id(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT account_owner_id FROM public.professionals WHERE user_id = _user_id AND account_owner_id IS NOT NULL LIMIT 1),
    (SELECT account_owner_id FROM public.profiles WHERE id = _user_id)
  );
$function$;