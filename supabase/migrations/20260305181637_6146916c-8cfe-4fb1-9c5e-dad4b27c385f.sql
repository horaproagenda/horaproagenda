-- Tighten overly permissive RLS policies on sensitive tables
DROP POLICY IF EXISTS "Authenticated users can insert appointments" ON public.appointments;
DROP POLICY IF EXISTS "Authenticated users can update appointments" ON public.appointments;
DROP POLICY IF EXISTS "Authenticated users can insert clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can update clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can view financial_entries" ON public.financial_entries;

-- Remove privilege-escalation/self-management policies on role assignments and audit logs
DROP POLICY IF EXISTS "Authenticated users can view roles" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_insert_own" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_update_own" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_delete_own" ON public.user_roles;

DROP POLICY IF EXISTS "audit_logs_select_own" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_own" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_update_own" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_delete_own" ON public.audit_logs;

-- Restrict document fill links to staff and move public token access into SECURITY DEFINER functions
DROP POLICY IF EXISTS "Anyone can read and fill documents by token" ON public.document_fill_links;
DROP POLICY IF EXISTS "Anyone can update filled content by token" ON public.document_fill_links;
DROP POLICY IF EXISTS "Authenticated users can manage document fill links" ON public.document_fill_links;
DROP POLICY IF EXISTS "Staff can view document fill links" ON public.document_fill_links;
DROP POLICY IF EXISTS "Staff can create document fill links" ON public.document_fill_links;
DROP POLICY IF EXISTS "Staff can update document fill links" ON public.document_fill_links;
DROP POLICY IF EXISTS "Staff can delete document fill links" ON public.document_fill_links;

CREATE POLICY "Staff can view document fill links"
ON public.document_fill_links
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'receptionist')
);

CREATE POLICY "Staff can create document fill links"
ON public.document_fill_links
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'receptionist')
);

CREATE POLICY "Staff can update document fill links"
ON public.document_fill_links
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'receptionist')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'receptionist')
);

CREATE POLICY "Staff can delete document fill links"
ON public.document_fill_links
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'receptionist')
);

CREATE OR REPLACE FUNCTION public.get_document_fill_link_by_token(p_token text)
RETURNS TABLE (
  id uuid,
  template_id uuid,
  client_id uuid,
  professional_id uuid,
  status text,
  expires_at timestamptz,
  filled_at timestamptz,
  filled_content text,
  filled_variables jsonb,
  template_title text,
  template_content text,
  template_variables text[],
  professional_name text,
  client_name text,
  client_birthdate date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dfl.id,
    dfl.template_id,
    dfl.client_id,
    dfl.professional_id,
    dfl.status,
    dfl.expires_at,
    dfl.filled_at,
    dfl.filled_content,
    dfl.filled_variables,
    dt.title,
    dt.content,
    dt.variables,
    p.name,
    c.name,
    c.birthdate
  FROM public.document_fill_links dfl
  JOIN public.document_templates dt ON dt.id = dfl.template_id
  LEFT JOIN public.professionals p ON p.id = dfl.professional_id
  LEFT JOIN public.clients c ON c.id = dfl.client_id
  WHERE dfl.token = p_token
    AND (dfl.expires_at IS NULL OR dfl.expires_at >= now())
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_document_fill_by_token(
  p_token text,
  p_filled_content text,
  p_filled_variables jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.document_fill_links%ROWTYPE;
  v_document_id uuid;
BEGIN
  SELECT *
  INTO v_link
  FROM public.document_fill_links
  WHERE token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LINK_NOT_FOUND';
  END IF;

  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RAISE EXCEPTION 'LINK_EXPIRED';
  END IF;

  IF v_link.status = 'filled' THEN
    RETURN v_link.id;
  END IF;

  UPDATE public.document_fill_links
  SET status = 'filled',
      filled_at = now(),
      filled_content = p_filled_content,
      filled_variables = COALESCE(p_filled_variables, '{}'::jsonb),
      updated_at = now()
  WHERE id = v_link.id;

  IF v_link.client_id IS NOT NULL THEN
    INSERT INTO public.client_documents (
      client_id,
      template_id,
      title,
      description,
      type,
      content,
      filled_variables
    )
    SELECT
      v_link.client_id,
      dt.id,
      dt.title || ' - Preenchido pelo Cliente',
      'Preenchido via link em ' || to_char(now(), 'DD/MM/YYYY" às "HH24:MI'),
      CASE
        WHEN lower(dt.title) LIKE '%anamnese%' THEN 'anamnese'::public.document_type
        WHEN lower(dt.title) LIKE '%contrato%' THEN 'contract'::public.document_type
        ELSE 'other'::public.document_type
      END,
      p_filled_content,
      COALESCE(p_filled_variables, '{}'::jsonb)
    FROM public.document_templates dt
    WHERE dt.id = v_link.template_id
    RETURNING id INTO v_document_id;
  END IF;

  RETURN COALESCE(v_document_id, v_link.id);
END;
$$;