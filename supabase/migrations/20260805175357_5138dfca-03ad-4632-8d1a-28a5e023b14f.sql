-- 1) Super admin nunca lê credenciais operacionais de WhatsApp dos tenants
DROP POLICY IF EXISTS "tenant_super_admin_whatsapp_credentials" ON public.professional_whatsapp_credentials;

DROP POLICY IF EXISTS "tenant_isolation_restrictive" ON public.professional_whatsapp_credentials;
CREATE POLICY "tenant_isolation_restrictive"
ON public.professional_whatsapp_credentials
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (account_owner_id = public.current_account_owner_id())
WITH CHECK (account_owner_id = public.current_account_owner_id());

-- 2) Padroniza checagem de super admin no pool de instâncias
DROP POLICY IF EXISTS "Super admin manages ultramsg pool" ON public.ultramsg_instance_pool;
CREATE POLICY "Super admin manages ultramsg pool"
ON public.ultramsg_instance_pool
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- 3) get_professional_id_by_user_or_email: fallback por e-mail restrito à mesma conta
CREATE OR REPLACE FUNCTION public.get_professional_id_by_user_or_email(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (
      SELECT p.id
      FROM public.professionals p
      WHERE p.user_id = _user_id
      ORDER BY p.is_active DESC, p.created_at DESC
      LIMIT 1
    ),
    (
      SELECT p.id
      FROM public.professionals p
      JOIN public.profiles pr ON lower(trim(pr.email)) = lower(trim(p.email))
      WHERE pr.id = _user_id
        AND p.email IS NOT NULL
        AND trim(p.email) <> ''
        AND p.account_owner_id = public.get_account_owner_for_user(_user_id)
      ORDER BY p.is_active DESC, p.created_at DESC
      LIMIT 1
    )
  )
$function$;

-- 4) Waitlist: escopo de conta em todas as operações + sem match por NULL
DROP POLICY IF EXISTS "Users can view relevant waitlist" ON public.waitlist;
DROP POLICY IF EXISTS "Users can insert relevant waitlist" ON public.waitlist;
DROP POLICY IF EXISTS "Users can update relevant waitlist" ON public.waitlist;
DROP POLICY IF EXISTS "Users can delete relevant waitlist" ON public.waitlist;

CREATE POLICY "Users can view relevant waitlist"
ON public.waitlist FOR SELECT TO authenticated
USING (
  account_owner_id = public.current_account_owner_id()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
    OR (waitlist.professional_id IS NOT NULL AND waitlist.professional_id = public.get_professional_id_for_user(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = waitlist.client_id
        AND c.account_owner_id = public.current_account_owner_id()
        AND c.assigned_professional_id IS NOT NULL
        AND c.assigned_professional_id = public.get_professional_id_for_user(auth.uid())
    )
  )
);

CREATE POLICY "Users can insert relevant waitlist"
ON public.waitlist FOR INSERT TO authenticated
WITH CHECK (
  account_owner_id = public.current_account_owner_id()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
    OR (waitlist.professional_id IS NOT NULL AND waitlist.professional_id = public.get_professional_id_for_user(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = waitlist.client_id
        AND c.account_owner_id = public.current_account_owner_id()
        AND c.assigned_professional_id IS NOT NULL
        AND c.assigned_professional_id = public.get_professional_id_for_user(auth.uid())
    )
  )
);

CREATE POLICY "Users can update relevant waitlist"
ON public.waitlist FOR UPDATE TO authenticated
USING (
  account_owner_id = public.current_account_owner_id()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
    OR (waitlist.professional_id IS NOT NULL AND waitlist.professional_id = public.get_professional_id_for_user(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = waitlist.client_id
        AND c.account_owner_id = public.current_account_owner_id()
        AND c.assigned_professional_id IS NOT NULL
        AND c.assigned_professional_id = public.get_professional_id_for_user(auth.uid())
    )
  )
)
WITH CHECK (
  account_owner_id = public.current_account_owner_id()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
    OR (waitlist.professional_id IS NOT NULL AND waitlist.professional_id = public.get_professional_id_for_user(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = waitlist.client_id
        AND c.account_owner_id = public.current_account_owner_id()
        AND c.assigned_professional_id IS NOT NULL
        AND c.assigned_professional_id = public.get_professional_id_for_user(auth.uid())
    )
  )
);

CREATE POLICY "Users can delete relevant waitlist"
ON public.waitlist FOR DELETE TO authenticated
USING (
  account_owner_id = public.current_account_owner_id()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
    OR (waitlist.professional_id IS NOT NULL AND waitlist.professional_id = public.get_professional_id_for_user(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = waitlist.client_id
        AND c.account_owner_id = public.current_account_owner_id()
        AND c.assigned_professional_id IS NOT NULL
        AND c.assigned_professional_id = public.get_professional_id_for_user(auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "tenant_isolation_restrictive" ON public.waitlist;
CREATE POLICY "tenant_isolation_restrictive"
ON public.waitlist AS RESTRICTIVE FOR ALL TO authenticated
USING (account_owner_id = public.current_account_owner_id())
WITH CHECK (account_owner_id = public.current_account_owner_id());

-- 5) financial_entries: isolamento estrito é intencional; garante coluna sempre preenchida
ALTER TABLE public.financial_entries
  ALTER COLUMN account_owner_id SET DEFAULT public.current_account_owner_id();
UPDATE public.financial_entries fe
SET account_owner_id = public.get_account_owner_for_user(fe.created_by)
WHERE fe.account_owner_id IS NULL AND fe.created_by IS NOT NULL;
ALTER TABLE public.financial_entries
  ALTER COLUMN account_owner_id SET NOT NULL;