
-- ============================================================
-- MIGRATION 2/3: Multi-tenant RLS enforcement
-- Rewrites policies on 6 critical tables to require
-- account_owner_id = current_account_owner_id(). Keeps
-- super_admin as a global bypass for support.
-- ============================================================

-- Step 1: enforce NOT NULL now that backfill is verified
ALTER TABLE public.business_settings                ALTER COLUMN account_owner_id SET NOT NULL;
ALTER TABLE public.user_roles                       ALTER COLUMN account_owner_id SET NOT NULL;
ALTER TABLE public.professional_whatsapp_credentials ALTER COLUMN account_owner_id SET NOT NULL;
ALTER TABLE public.professional_credentials         ALTER COLUMN account_owner_id SET NOT NULL;
ALTER TABLE public.appointments                     ALTER COLUMN account_owner_id SET NOT NULL;
ALTER TABLE public.professionals                    ALTER COLUMN account_owner_id SET NOT NULL;

-- ============================================================
-- appointments
-- ============================================================
DROP POLICY IF EXISTS "Admins can delete appointments"                     ON public.appointments;
DROP POLICY IF EXISTS "Authenticated users can view appointments"          ON public.appointments;
DROP POLICY IF EXISTS "Only admins can delete appointments"                ON public.appointments;
DROP POLICY IF EXISTS "Staff and own professionals can insert appointments" ON public.appointments;
DROP POLICY IF EXISTS "Staff and own professionals can update appointments" ON public.appointments;

CREATE POLICY "tenant_select_appointments" ON public.appointments
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      account_owner_id = public.current_account_owner_id()
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'receptionist'::app_role)
        OR (
          public.has_role(auth.uid(), 'professional'::app_role)
          AND professional_id = public.get_professional_id_for_user(auth.uid())
        )
      )
    )
  );

CREATE POLICY "tenant_insert_appointments" ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      account_owner_id = public.current_account_owner_id()
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'receptionist'::app_role)
        OR (
          public.has_role(auth.uid(), 'professional'::app_role)
          AND professional_id = public.get_professional_id_for_user(auth.uid())
          AND public.can_access_client_record(client_id)
        )
      )
    )
  );

CREATE POLICY "tenant_update_appointments" ON public.appointments
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      account_owner_id = public.current_account_owner_id()
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'receptionist'::app_role)
        OR (
          public.has_role(auth.uid(), 'professional'::app_role)
          AND professional_id = public.get_professional_id_for_user(auth.uid())
        )
      )
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      account_owner_id = public.current_account_owner_id()
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'receptionist'::app_role)
        OR (
          public.has_role(auth.uid(), 'professional'::app_role)
          AND professional_id = public.get_professional_id_for_user(auth.uid())
        )
      )
    )
  );

CREATE POLICY "tenant_delete_appointments" ON public.appointments
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      account_owner_id = public.current_account_owner_id()
      AND public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

-- ============================================================
-- business_settings
-- ============================================================
DROP POLICY IF EXISTS "Admins and receptionists can view business settings" ON public.business_settings;
DROP POLICY IF EXISTS "Admins can insert settings"                          ON public.business_settings;
DROP POLICY IF EXISTS "Admins can update settings"                          ON public.business_settings;

CREATE POLICY "tenant_select_business_settings" ON public.business_settings
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      account_owner_id = public.current_account_owner_id()
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'receptionist'::app_role)
        OR public.has_role(auth.uid(), 'professional'::app_role)
      )
    )
  );

CREATE POLICY "tenant_insert_business_settings" ON public.business_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      account_owner_id = public.current_account_owner_id()
      AND public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

CREATE POLICY "tenant_update_business_settings" ON public.business_settings
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      account_owner_id = public.current_account_owner_id()
      AND public.has_role(auth.uid(), 'admin'::app_role)
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      account_owner_id = public.current_account_owner_id()
      AND public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

-- ============================================================
-- professional_credentials
-- ============================================================
DROP POLICY IF EXISTS "admins_read_credentials"  ON public.professional_credentials;
DROP POLICY IF EXISTS "admins_write_credentials" ON public.professional_credentials;

CREATE POLICY "tenant_read_professional_credentials" ON public.professional_credentials
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      account_owner_id = public.current_account_owner_id()
      AND public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

CREATE POLICY "tenant_write_professional_credentials" ON public.professional_credentials
  FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      account_owner_id = public.current_account_owner_id()
      AND public.has_role(auth.uid(), 'admin'::app_role)
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      account_owner_id = public.current_account_owner_id()
      AND public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

-- ============================================================
-- professional_whatsapp_credentials
-- ============================================================
DROP POLICY IF EXISTS "Professional manages own whatsapp credentials"   ON public.professional_whatsapp_credentials;
DROP POLICY IF EXISTS "Super admin full access to whatsapp credentials" ON public.professional_whatsapp_credentials;

CREATE POLICY "tenant_super_admin_whatsapp_credentials" ON public.professional_whatsapp_credentials
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "tenant_professional_whatsapp_credentials" ON public.professional_whatsapp_credentials
  FOR ALL TO authenticated
  USING (
    account_owner_id = public.current_account_owner_id()
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR professional_id = public.get_professional_id_for_user(auth.uid())
    )
  )
  WITH CHECK (
    account_owner_id = public.current_account_owner_id()
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR professional_id = public.get_professional_id_for_user(auth.uid())
    )
  );

-- ============================================================
-- professionals
-- ============================================================
DROP POLICY IF EXISTS "Admins and receptionists can view professionals" ON public.professionals;
DROP POLICY IF EXISTS "Only admins can delete professionals"            ON public.professionals;
DROP POLICY IF EXISTS "Only admins can insert professionals"            ON public.professionals;
DROP POLICY IF EXISTS "Only admins can update professionals"            ON public.professionals;
DROP POLICY IF EXISTS "Professionals can update own row safe fields"    ON public.professionals;
DROP POLICY IF EXISTS "Professionals can view own record"               ON public.professionals;

CREATE POLICY "tenant_select_professionals" ON public.professionals
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      account_owner_id = public.current_account_owner_id()
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'receptionist'::app_role)
        OR auth.uid() = user_id
      )
    )
  );

CREATE POLICY "tenant_insert_professionals" ON public.professionals
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      account_owner_id = public.current_account_owner_id()
      AND public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

CREATE POLICY "tenant_update_professionals_admin" ON public.professionals
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      account_owner_id = public.current_account_owner_id()
      AND public.has_role(auth.uid(), 'admin'::app_role)
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      account_owner_id = public.current_account_owner_id()
      AND public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

CREATE POLICY "tenant_update_professionals_self" ON public.professionals
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND account_owner_id = public.current_account_owner_id()
  )
  WITH CHECK (
    auth.uid() = user_id
    AND account_owner_id = public.current_account_owner_id()
  );

CREATE POLICY "tenant_delete_professionals" ON public.professionals
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      account_owner_id = public.current_account_owner_id()
      AND public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

-- ============================================================
-- user_roles
-- ============================================================
DROP POLICY IF EXISTS "Admins can delete roles"      ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles"      ON public.user_roles;
DROP POLICY IF EXISTS "Only admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only admins can view roles"   ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles"     ON public.user_roles;

CREATE POLICY "tenant_select_user_roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR user_id = auth.uid()
    OR (
      account_owner_id = public.current_account_owner_id()
      AND public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

CREATE POLICY "tenant_insert_user_roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      account_owner_id = public.current_account_owner_id()
      AND public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

CREATE POLICY "tenant_update_user_roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      account_owner_id = public.current_account_owner_id()
      AND public.has_role(auth.uid(), 'admin'::app_role)
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      account_owner_id = public.current_account_owner_id()
      AND public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

CREATE POLICY "tenant_delete_user_roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      account_owner_id = public.current_account_owner_id()
      AND public.has_role(auth.uid(), 'admin'::app_role)
    )
  );
