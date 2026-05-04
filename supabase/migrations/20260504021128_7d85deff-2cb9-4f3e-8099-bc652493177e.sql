
-- 1) Fix can_access_client_record to include receptionist
CREATE OR REPLACE FUNCTION public.can_access_client_record(_client_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = _client_id
        AND c.assigned_professional_id = public.get_professional_id_for_user(auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.client_id = _client_id
        AND a.professional_id = public.get_professional_id_for_user(auth.uid())
    );
$function$;

-- 2) Fix whatsapp_queue policies
DROP POLICY IF EXISTS whatsapp_queue_select ON public.whatsapp_queue;
DROP POLICY IF EXISTS whatsapp_queue_update ON public.whatsapp_queue;
DROP POLICY IF EXISTS whatsapp_queue_delete ON public.whatsapp_queue;

CREATE POLICY whatsapp_queue_select ON public.whatsapp_queue
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
    OR (
      client_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = whatsapp_queue.client_id
          AND c.assigned_professional_id = public.get_professional_id_for_user(auth.uid())
      )
    )
  );

CREATE POLICY whatsapp_queue_update ON public.whatsapp_queue
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  );

CREATE POLICY whatsapp_queue_delete ON public.whatsapp_queue
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  );

-- 3) Remove overly broad whatsapp_templates policies
DROP POLICY IF EXISTS "Auth users delete whatsapp templates" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Auth users insert whatsapp templates" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Auth users update whatsapp templates" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Auth users view whatsapp templates" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Authenticated users can view whatsapp_templates" ON public.whatsapp_templates;

-- Allow admins + receptionists to view templates (so messaging UI still works for staff)
CREATE POLICY "Staff can view whatsapp_templates" ON public.whatsapp_templates
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  );

-- 4) Restrict professional self-update to safe fields only.
DROP POLICY IF EXISTS professionals_update_own ON public.professionals;

CREATE OR REPLACE FUNCTION public.prevent_professional_privilege_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  -- If the change is being performed by an admin, allow everything
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  -- Non-admin users (typically the professional themself) cannot modify
  -- privileged / financial fields.
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
$$;

DROP TRIGGER IF EXISTS trg_prevent_professional_privilege_escalation ON public.professionals;
CREATE TRIGGER trg_prevent_professional_privilege_escalation
  BEFORE UPDATE ON public.professionals
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_professional_privilege_escalation();

CREATE POLICY professionals_update_own ON public.professionals
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
