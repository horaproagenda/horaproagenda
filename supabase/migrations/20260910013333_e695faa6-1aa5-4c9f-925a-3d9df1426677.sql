-- 1) Admin check based solely on explicit role
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'admin'::app_role
FROM public.profiles p
WHERE coalesce(p.account_owner_id, p.id) = p.id
  AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_account_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL AND public.has_role(_user_id, 'admin');
$function$;

-- Prevent tenant reassignment on profiles (which fed the old self-reference check)
CREATE OR REPLACE FUNCTION public.guard_profile_account_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.account_owner_id IS DISTINCT FROM OLD.account_owner_id
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'account_owner_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_profile_account_owner_trg ON public.profiles;
CREATE TRIGGER guard_profile_account_owner_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_account_owner();

-- 2) Restrictive tenant isolation backstop on product_usage_records
DROP POLICY IF EXISTS tenant_isolation_restrictive ON public.product_usage_records;
CREATE POLICY tenant_isolation_restrictive ON public.product_usage_records
AS RESTRICTIVE FOR ALL TO authenticated
USING (account_owner_id = public.current_account_owner_id())
WITH CHECK (account_owner_id = public.current_account_owner_id());

-- 3) Restrict professional PII to admins and the professional themself
DROP POLICY IF EXISTS tenant_select_professionals ON public.professionals;
CREATE POLICY tenant_select_professionals ON public.professionals
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    account_owner_id = public.current_account_owner_id()
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR auth.uid() = user_id)
  )
);

DROP VIEW IF EXISTS public.professionals_directory;
CREATE VIEW public.professionals_directory
WITH (security_invoker = false) AS
SELECT p.id, p.name, p.email, p.phone, p.specialties, p.bio, p.avatar_url, p.is_active,
       p.created_at, p.updated_at, p.agenda_color, p.app_role, p.user_id, p.permissions,
       p.is_commission_based, p.commission_percentage, p.commission_type,
       p.commission_fixed_value, p.commission_frequency, p.commission_payment_day,
       p.company_name, p.whatsapp_from_number, p.quiet_hours_start, p.quiet_hours_end,
       p.account_owner_id, p.whatsapp_release_approved, p.whatsapp_release_approved_at,
       p.allowed_room_ids, p.allowed_equipment_ids, p.employment_type, p.public_code
FROM public.professionals p
WHERE p.account_owner_id = public.current_account_owner_id()
  AND NOT public.is_super_admin(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
    OR p.user_id = auth.uid()
  );

GRANT SELECT ON public.professionals_directory TO authenticated;