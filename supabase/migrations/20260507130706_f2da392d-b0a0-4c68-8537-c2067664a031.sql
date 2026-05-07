
-- 1) Restrict document_templates SELECT to authenticated users
DROP POLICY IF EXISTS "Authenticated users can view document templates" ON public.document_templates;
CREATE POLICY "Authenticated users can view document templates"
ON public.document_templates FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- 2) Update get_document_fill_link_by_token to:
--    - strip sensitive PII (cpf, birthdate, phone) from prefill snapshot
--    - include template (title, content, variables) inline so anon doesn't need direct table read
CREATE OR REPLACE FUNCTION public.get_document_fill_link_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec public.document_fill_links%ROWTYPE;
  v_template jsonb;
  v_prefill jsonb;
  v_filled_vars jsonb;
  result jsonb;
BEGIN
  SELECT * INTO rec
  FROM public.document_fill_links
  WHERE token = p_token
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Fetch template
  SELECT to_jsonb(t) - 'created_by' - 'created_at' - 'updated_at'
  INTO v_template
  FROM (
    SELECT id, title, content, variables
    FROM public.document_templates
    WHERE id = rec.template_id
  ) t;

  -- Sanitize prefill: keep only client.id/name and professional.id/name + non-PII formData
  v_filled_vars := COALESCE(rec.filled_variables, '{}'::jsonb);
  IF v_filled_vars ? '__prefill' THEN
    v_prefill := v_filled_vars->'__prefill';
    -- Remove sensitive client fields
    IF v_prefill ? 'client' THEN
      v_prefill := jsonb_set(
        v_prefill,
        '{client}',
        (v_prefill->'client') - 'cpf' - 'birthdate' - 'phone'
      );
    END IF;
    -- Strip sensitive auto-fill formData fields
    IF v_prefill ? 'formData' THEN
      v_prefill := jsonb_set(
        v_prefill,
        '{formData}',
        (v_prefill->'formData')
          - 'cpf' - 'telefone' - 'data_nascimento' - 'nascimento'
          - 'idade' - 'idade_cliente'
      );
    END IF;
    v_filled_vars := jsonb_set(v_filled_vars, '{__prefill}', v_prefill);
  END IF;

  result := jsonb_build_object(
    'id', rec.id,
    'template_id', rec.template_id,
    'client_id', rec.client_id,
    'professional_id', rec.professional_id,
    'status', rec.status,
    'expires_at', rec.expires_at,
    'filled_at', rec.filled_at,
    'filled_content', rec.filled_content,
    'filled_variables', v_filled_vars,
    'template', v_template,
    'requires_cpf', EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = rec.client_id
        AND c.cpf IS NOT NULL
        AND length(regexp_replace(c.cpf, '\D', '', 'g')) = 11
    )
  );

  RETURN result;
END;
$$;

-- 3) Enforce server-side CPF check in submit_document_fill_by_token
CREATE OR REPLACE FUNCTION public.submit_document_fill_by_token(
  p_token text,
  p_filled_content text,
  p_filled_variables jsonb DEFAULT '{}'::jsonb,
  p_cpf text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_link public.document_fill_links%ROWTYPE;
  v_document_id uuid;
  v_client_cpf text;
  v_provided_cpf text;
BEGIN
  SELECT * INTO v_link
  FROM public.document_fill_links
  WHERE token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LINK_NOT_FOUND';
  END IF;

  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RAISE EXCEPTION 'LINK_EXPIRED';
  END IF;

  -- Server-side CPF validation
  IF v_link.client_id IS NOT NULL THEN
    SELECT regexp_replace(COALESCE(cpf, ''), '\D', '', 'g')
    INTO v_client_cpf
    FROM public.clients
    WHERE id = v_link.client_id;

    IF v_client_cpf IS NOT NULL AND length(v_client_cpf) = 11 THEN
      v_provided_cpf := regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');
      IF v_provided_cpf IS NULL OR v_provided_cpf <> v_client_cpf THEN
        RAISE EXCEPTION 'CPF_MISMATCH';
      END IF;
    END IF;
  END IF;

  IF v_link.status = 'filled' THEN
    SELECT id INTO v_document_id
    FROM public.client_documents
    WHERE client_id = v_link.client_id
      AND template_id = v_link.template_id
      AND content IS NOT NULL
      AND length(trim(content)) > 0
    ORDER BY updated_at DESC
    LIMIT 1;
    RETURN COALESCE(v_document_id, v_link.id);
  END IF;

  UPDATE public.document_fill_links
  SET status = 'filled',
      filled_at = now(),
      filled_content = p_filled_content,
      filled_variables = COALESCE(p_filled_variables, '{}'::jsonb),
      updated_at = now()
  WHERE id = v_link.id;

  IF v_link.client_id IS NOT NULL THEN
    SELECT id INTO v_document_id
    FROM public.client_documents
    WHERE client_id = v_link.client_id
      AND template_id = v_link.template_id
    ORDER BY
      CASE WHEN content IS NULL OR length(trim(content)) = 0 THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT 1;

    IF v_document_id IS NOT NULL THEN
      UPDATE public.client_documents cd
      SET content = p_filled_content,
          filled_variables = COALESCE(p_filled_variables, '{}'::jsonb),
          signed_at = now(),
          signed_by = COALESCE(p_filled_variables->>'nome', p_filled_variables->>'nome_cliente', p_filled_variables->>'cliente', 'Cliente'),
          description = COALESCE(NULLIF(cd.description, ''), 'Preenchido via link em ' || to_char(now(), 'DD/MM/YYYY" às "HH24:MI')),
          updated_at = now()
      WHERE cd.id = v_document_id;
    ELSE
      INSERT INTO public.client_documents (
        client_id, template_id, title, description, type, content,
        filled_variables, signed_at, signed_by
      )
      SELECT
        v_link.client_id, dt.id, dt.title,
        'Preenchido via link em ' || to_char(now(), 'DD/MM/YYYY" às "HH24:MI'),
        CASE
          WHEN lower(dt.title) LIKE '%anamnese%' THEN 'anamnese'::public.document_type
          WHEN lower(dt.title) LIKE '%contrato%' THEN 'contract'::public.document_type
          ELSE 'other'::public.document_type
        END,
        p_filled_content,
        COALESCE(p_filled_variables, '{}'::jsonb),
        now(),
        COALESCE(p_filled_variables->>'nome', p_filled_variables->>'nome_cliente', p_filled_variables->>'cliente', 'Cliente')
      FROM public.document_templates dt
      WHERE dt.id = v_link.template_id
      RETURNING id INTO v_document_id;
    END IF;
  END IF;

  RETURN COALESCE(v_document_id, v_link.id);
END;
$$;

-- 4) Auto-purge temp_password trigger
CREATE OR REPLACE FUNCTION public.purge_temp_password_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Clear temp_password if password was changed or older than 7 days
  IF NEW.password_changed_at IS NOT NULL THEN
    NEW.temp_password := NULL;
  END IF;
  IF NEW.temp_password IS NOT NULL AND NEW.set_at < now() - interval '7 days' THEN
    NEW.temp_password := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prof_creds_purge_temp ON public.professional_credentials;
CREATE TRIGGER trg_prof_creds_purge_temp
BEFORE INSERT OR UPDATE ON public.professional_credentials
FOR EACH ROW EXECUTE FUNCTION public.purge_temp_password_after_change();

-- One-time cleanup
UPDATE public.professional_credentials
SET temp_password = NULL
WHERE password_changed_at IS NOT NULL
   OR set_at < now() - interval '7 days';
