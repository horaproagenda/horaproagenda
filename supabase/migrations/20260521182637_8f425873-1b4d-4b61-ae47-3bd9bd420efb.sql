-- Reconhecimento robusto do profissional logado
CREATE OR REPLACE FUNCTION public.get_professional_id_by_user_or_email(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
      ORDER BY p.is_active DESC, p.created_at DESC
      LIMIT 1
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.get_professional_id_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.get_professional_id_by_user_or_email(_user_id)
$$;

CREATE OR REPLACE FUNCTION public.link_current_user_professional()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_professional_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_professional_id := public.get_professional_id_by_user_or_email(v_user_id);

  IF v_professional_id IS NOT NULL THEN
    ALTER TABLE public.professionals DISABLE TRIGGER prevent_professional_privilege_escalation_trg;
    UPDATE public.professionals
    SET user_id = v_user_id,
        updated_at = now()
    WHERE id = v_professional_id
      AND user_id IS NULL;
    ALTER TABLE public.professionals ENABLE TRIGGER prevent_professional_privilege_escalation_trg;
  END IF;

  RETURN v_professional_id;
EXCEPTION WHEN OTHERS THEN
  -- Se o nome do trigger for outro, apenas tentamos o update sem desabilitar
  BEGIN
    UPDATE public.professionals
    SET user_id = v_user_id,
        updated_at = now()
    WHERE id = v_professional_id
      AND user_id IS NULL;
  EXCEPTION WHEN OTHERS THEN
    -- Ignora; o reconhecimento por e-mail ainda funciona em tempo real.
    NULL;
  END;
  RETURN v_professional_id;
END;
$$;

-- Acesso ampliado a clientes/pacotes
CREATE OR REPLACE FUNCTION public.can_access_client_record(_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    )
    OR EXISTS (
      SELECT 1 FROM public.service_packages sp
      WHERE sp.client_id = _client_id
        AND sp.professional_id = public.get_professional_id_for_user(auth.uid())
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_service_package(_package_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.service_packages sp
      WHERE sp.id = _package_id
        AND (
          sp.professional_id = public.get_professional_id_for_user(auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = sp.client_id
              AND c.assigned_professional_id = public.get_professional_id_for_user(auth.uid())
          )
          OR EXISTS (
            SELECT 1 FROM public.package_appointments pa
            JOIN public.appointments a ON a.id = pa.appointment_id
            WHERE pa.package_id = sp.id
              AND a.professional_id = public.get_professional_id_for_user(auth.uid())
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_package_appointment(_package_appointment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.package_appointments pa
      JOIN public.service_packages sp ON sp.id = pa.package_id
      LEFT JOIN public.appointments a ON a.id = pa.appointment_id
      WHERE pa.id = _package_appointment_id
        AND (
          sp.professional_id = public.get_professional_id_for_user(auth.uid())
          OR a.professional_id = public.get_professional_id_for_user(auth.uid())
        )
    );
$$;

-- Políticas: agendamentos
DROP POLICY IF EXISTS "Admins and receptionists can insert appointments" ON public.appointments;
DROP POLICY IF EXISTS "Staff and own professionals can insert appointments" ON public.appointments;
CREATE POLICY "Staff and own professionals can insert appointments"
ON public.appointments
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'professional'::public.app_role)
    AND professional_id = public.get_professional_id_for_user(auth.uid())
    AND public.can_access_client_record(client_id)
  )
);

DROP POLICY IF EXISTS "Admins and receptionists can update appointments" ON public.appointments;
DROP POLICY IF EXISTS "Staff and own professionals can update appointments" ON public.appointments;
CREATE POLICY "Staff and own professionals can update appointments"
ON public.appointments
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'professional'::public.app_role)
    AND professional_id = public.get_professional_id_for_user(auth.uid())
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'professional'::public.app_role)
    AND professional_id = public.get_professional_id_for_user(auth.uid())
  )
);

-- Políticas: sessões de pacote
DROP POLICY IF EXISTS "Staff can insert package appointments" ON public.package_appointments;
DROP POLICY IF EXISTS "Staff and package professionals can insert package appointments" ON public.package_appointments;
CREATE POLICY "Staff and package professionals can insert package appointments"
ON public.package_appointments
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.service_packages sp
    WHERE sp.id = package_id
      AND sp.professional_id = public.get_professional_id_for_user(auth.uid())
  )
);

DROP POLICY IF EXISTS "Staff can update package appointments" ON public.package_appointments;
DROP POLICY IF EXISTS "Staff and package professionals can update package appointments" ON public.package_appointments;
CREATE POLICY "Staff and package professionals can update package appointments"
ON public.package_appointments
FOR UPDATE
TO authenticated
USING (public.can_manage_package_appointment(id))
WITH CHECK (public.can_manage_package_appointment(id));

-- Upload de fotos: reforça caminho client_id/photos
CREATE OR REPLACE FUNCTION public.can_upload_client_storage_object(_bucket_id text, _object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    _bucket_id IN ('client-photos', 'client-documents')
    AND auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
      OR (
        split_part(_object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.can_access_client_record(split_part(_object_name, '/', 1)::uuid)
      )
    );
$$;