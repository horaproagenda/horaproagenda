CREATE OR REPLACE FUNCTION public.submit_document_fill_by_token(p_token text, p_filled_content text, p_filled_variables jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    SELECT id
    INTO v_document_id
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
    SELECT id
    INTO v_document_id
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
        client_id,
        template_id,
        title,
        description,
        type,
        content,
        filled_variables,
        signed_at,
        signed_by
      )
      SELECT
        v_link.client_id,
        dt.id,
        dt.title,
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
$function$;