-- Prevent professionals from escalating their own permissions/role/commission via self-update
-- by replacing the self-update policy with a trigger that blocks privileged column changes.

DROP POLICY IF EXISTS "Professionals can update own row safe fields" ON public.professionals;

-- Re-create self-update policy (same scope)
CREATE POLICY "Professionals can update own row safe fields"
ON public.professionals
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Trigger that blocks self-edits to privileged columns; admins are exempt.
CREATE OR REPLACE FUNCTION public.prevent_professional_self_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins may change any field
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Only enforce on self-updates by the professional themselves
  IF auth.uid() IS DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
  END IF;

  -- Block changes to privileged columns
  IF NEW.permissions IS DISTINCT FROM OLD.permissions THEN
    RAISE EXCEPTION 'Professionals cannot modify their own permissions';
  END IF;
  IF NEW.app_role IS DISTINCT FROM OLD.app_role THEN
    RAISE EXCEPTION 'Professionals cannot modify their own role';
  END IF;
  IF NEW.is_commission_based IS DISTINCT FROM OLD.is_commission_based
     OR NEW.commission_percentage IS DISTINCT FROM OLD.commission_percentage
     OR NEW.commission_type IS DISTINCT FROM OLD.commission_type
     OR NEW.commission_fixed_value IS DISTINCT FROM OLD.commission_fixed_value
     OR NEW.commission_frequency IS DISTINCT FROM OLD.commission_frequency
     OR NEW.commission_payment_day IS DISTINCT FROM OLD.commission_payment_day THEN
    RAISE EXCEPTION 'Professionals cannot modify their own commission settings';
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'Professionals cannot toggle their own active status';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Professionals cannot change their user_id';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_professional_self_privilege_escalation ON public.professionals;
CREATE TRIGGER trg_prevent_professional_self_privilege_escalation
BEFORE UPDATE ON public.professionals
FOR EACH ROW
EXECUTE FUNCTION public.prevent_professional_self_privilege_escalation();