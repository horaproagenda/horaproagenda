-- 1) Professionals: harden privilege-escalation triggers (add account_owner_id, fix search_path)
CREATE OR REPLACE FUNCTION public.prevent_professional_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR current_user IN ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.app_role IS DISTINCT FROM OLD.app_role
     OR NEW.permissions IS DISTINCT FROM OLD.permissions
     OR NEW.whatsapp_release_approved IS DISTINCT FROM OLD.whatsapp_release_approved
     OR NEW.is_commission_based IS DISTINCT FROM OLD.is_commission_based
     OR NEW.commission_type IS DISTINCT FROM OLD.commission_type
     OR NEW.commission_percentage IS DISTINCT FROM OLD.commission_percentage
     OR NEW.commission_fixed_value IS DISTINCT FROM OLD.commission_fixed_value
     OR NEW.commission_frequency IS DISTINCT FROM OLD.commission_frequency
     OR NEW.commission_payment_day IS DISTINCT FROM OLD.commission_payment_day
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.account_owner_id IS DISTINCT FROM OLD.account_owner_id
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
  THEN
    RAISE EXCEPTION 'Only admins can modify role, permissions, WhatsApp release, commission settings, account link or active status of a professional.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_professional_self_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
  END IF;

  IF NEW.permissions IS DISTINCT FROM OLD.permissions
     OR NEW.app_role IS DISTINCT FROM OLD.app_role
     OR NEW.whatsapp_release_approved IS DISTINCT FROM OLD.whatsapp_release_approved
     OR NEW.is_commission_based IS DISTINCT FROM OLD.is_commission_based
     OR NEW.commission_percentage IS DISTINCT FROM OLD.commission_percentage
     OR NEW.commission_type IS DISTINCT FROM OLD.commission_type
     OR NEW.commission_fixed_value IS DISTINCT FROM OLD.commission_fixed_value
     OR NEW.commission_frequency IS DISTINCT FROM OLD.commission_frequency
     OR NEW.commission_payment_day IS DISTINCT FROM OLD.commission_payment_day
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.account_owner_id IS DISTINCT FROM OLD.account_owner_id
  THEN
    RAISE EXCEPTION 'Professionals cannot modify their own privileges, commission settings or account link';
  END IF;

  RETURN NEW;
END;
$$;

-- Make sure both guards are attached on every UPDATE path
DROP TRIGGER IF EXISTS trg_prevent_professional_privilege_escalation ON public.professionals;
CREATE TRIGGER trg_prevent_professional_privilege_escalation
BEFORE UPDATE ON public.professionals
FOR EACH ROW EXECUTE FUNCTION public.prevent_professional_privilege_escalation();

DROP TRIGGER IF EXISTS trg_prevent_professional_self_privilege_escalation ON public.professionals;
CREATE TRIGGER trg_prevent_professional_self_privilege_escalation
BEFORE UPDATE ON public.professionals
FOR EACH ROW EXECUTE FUNCTION public.prevent_professional_self_privilege_escalation();

-- 2) user_roles: explicitly block ANY update/delete of one's own role row
DROP POLICY IF EXISTS restrictive_block_self_role_row_write ON public.user_roles;
CREATE POLICY restrictive_block_self_role_row_write
ON public.user_roles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (public.is_super_admin(auth.uid()) OR user_id <> auth.uid())
WITH CHECK (public.is_super_admin(auth.uid()) OR user_id <> auth.uid());

DROP POLICY IF EXISTS restrictive_block_self_role_row_delete ON public.user_roles;
CREATE POLICY restrictive_block_self_role_row_delete
ON public.user_roles
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (public.is_super_admin(auth.uid()) OR user_id <> auth.uid());

-- 3) waitlist: created_by must be the authenticated user on insert
DROP POLICY IF EXISTS restrictive_waitlist_created_by_self ON public.waitlist;
CREATE POLICY restrictive_waitlist_created_by_self
ON public.waitlist
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (created_by IS NULL OR created_by = auth.uid());