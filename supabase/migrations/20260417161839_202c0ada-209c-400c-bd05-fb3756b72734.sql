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
    -- Remove any prior empty/unfilled placeholder docs for this client+template (avoid duplicates)
    DELETE FROM public.client_documents
    WHERE client_id = v_link.client_id
      AND template_id = v_link.template_id
      AND (content IS NULL OR length(trim(content)) = 0)
      AND signed_at IS NULL;

    INSERT INTO public.client_documents (
      client_id,
      template_id,
      title,
      description,
      type,
      content,
      filled_variables,
      signed_at
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
      COALESCE(p_filled_variables, '{}'::jsonb),
      now()
    FROM public.document_templates dt
    WHERE dt.id = v_link.template_id
    RETURNING id INTO v_document_id;
  END IF;

  RETURN COALESCE(v_document_id, v_link.id);
END;
$function$;