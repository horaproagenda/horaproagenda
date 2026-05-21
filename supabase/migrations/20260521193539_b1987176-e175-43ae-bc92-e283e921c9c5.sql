-- Stop treating public form submission as a digital signature.
-- Filling health questions should populate content/variables only; signed_at remains reserved for real captured signatures.
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
          description = COALESCE(NULLIF(cd.description, ''), 'Preenchido via link em ' || to_char(now(), 'DD/MM/YYYY" às "HH24:MI')),
          updated_at = now()
      WHERE cd.id = v_document_id;
    ELSE
      INSERT INTO public.client_documents (
        client_id, template_id, title, description, type, content, filled_variables
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
        COALESCE(p_filled_variables, '{}'::jsonb)
      FROM public.document_templates dt
      WHERE dt.id = v_link.template_id
      RETURNING id INTO v_document_id;
    END IF;
  END IF;

  RETURN COALESCE(v_document_id, v_link.id);
END;
$$;

-- Repair historical false-positive signatures created by the previous link-submission function.
UPDATE public.client_documents cd
SET signed_at = NULL,
    signed_by = NULL,
    updated_at = now()
WHERE cd.signed_at IS NOT NULL
  AND cd.file_path IS NULL
  AND cd.description LIKE 'Preenchido via link em %'
  AND EXISTS (
    SELECT 1
    FROM public.document_fill_links dfl
    WHERE dfl.client_id = cd.client_id
      AND dfl.template_id = cd.template_id
      AND dfl.status = 'filled'
  );