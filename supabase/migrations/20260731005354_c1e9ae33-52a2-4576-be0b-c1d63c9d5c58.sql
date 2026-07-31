CREATE OR REPLACE FUNCTION public.prevent_professional_privilege_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Server-side/administrative contexts (service_role, postgres, cascades from
  -- account deletion) have no auth.uid(); the check only applies to end users.
  IF auth.uid() IS NULL
     OR current_user IN ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.app_role IS DISTINCT FROM OLD.app_role
     OR NEW.permissions IS DISTINCT FROM OLD.permissions
     OR NEW.is_commission_based IS DISTINCT FROM OLD.is_commission_based
     OR NEW.commission_type IS DISTINCT FROM OLD.commission_type
     OR NEW.commission_percentage IS DISTINCT FROM OLD.commission_percentage
     OR NEW.commission_fixed_value IS DISTINCT FROM OLD.commission_fixed_value
     OR NEW.commission_frequency IS DISTINCT FROM OLD.commission_frequency
     OR NEW.commission_payment_day IS DISTINCT FROM OLD.commission_payment_day
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
  THEN
    RAISE EXCEPTION 'Only admins can modify role, permissions, commission settings, account link or active status of a professional.';
  END IF;

  RETURN NEW;
END;
$function$;