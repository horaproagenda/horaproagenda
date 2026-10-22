-- Rollback: restore previous submit_document_fill_by_token/get_document_fill_link_by_token/authenticate_document_fill_link definitions from prior migrations.
CREATE OR REPLACE FUNCTION public.submit_document_fill_by_token(p_token text, p_filled_content text, p_filled_variables jsonb DEFAULT '{}'::jsonb, p_cpf text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_link public.document_fill_links%ROWTYPE;
  v_document_id uuid;
  v_client_cpf text;
  v_provided_cpf text;
  v_owner uuid;
BEGIN
  SELECT * INTO v_link FROM public.document_fill_links WHERE token = p_token LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LINK_NOT_FOUND'; END IF;
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN RAISE EXCEPTION 'LINK_EXPIRED'; END IF;
  v_owner := v_link.account_owner_id;
  IF v_link.client_id IS NOT NULL THEN
    SELECT regexp_replace(COALESCE(cpf, ''), '\D', '', 'g') INTO v_client_cpf
    FROM public.clients WHERE id = v_link.client_id AND account_owner_id = v_owner;
    IF NOT FOUND THEN RAISE EXCEPTION 'LINK_NOT_FOUND'; END IF;
    IF length(v_client_cpf) = 11 THEN
      v_provided_cpf := regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');
      IF v_provided_cpf <> v_client_cpf THEN RAISE EXCEPTION 'CPF_MISMATCH'; END IF;
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.document_templates WHERE id = v_link.template_id AND account_owner_id = v_owner) THEN
    RAISE EXCEPTION 'LINK_NOT_FOUND';
  END IF;
  IF v_link.status = 'filled' THEN
    SELECT id INTO v_document_id FROM public.client_documents
    WHERE client_id = v_link.client_id AND template_id = v_link.template_id AND account_owner_id = v_owner
      AND content IS NOT NULL AND length(trim(content)) > 0 ORDER BY updated_at DESC LIMIT 1;
    RETURN COALESCE(v_document_id, v_link.id);
  END IF;
  UPDATE public.document_fill_links SET status = 'filled', filled_at = now(), filled_content = p_filled_content,
    filled_variables = COALESCE(p_filled_variables, '{}'::jsonb), updated_at = now() WHERE id = v_link.id;
  IF v_link.client_id IS NOT NULL THEN
    SELECT id INTO v_document_id FROM public.client_documents
    WHERE client_id = v_link.client_id AND template_id = v_link.template_id AND account_owner_id = v_owner
    ORDER BY CASE WHEN content IS NULL OR length(trim(content)) = 0 THEN 0 ELSE 1 END, created_at DESC LIMIT 1;
    IF v_document_id IS NOT NULL THEN
      UPDATE public.client_documents cd SET content = p_filled_content, filled_variables = COALESCE(p_filled_variables, '{}'::jsonb),
        description = COALESCE(NULLIF(cd.description, ''), 'Preenchido via link em ' || to_char(now(), 'DD/MM/YYYY" às "HH24:MI')), updated_at = now()
      WHERE cd.id = v_document_id AND cd.account_owner_id = v_owner;
    ELSE
      INSERT INTO public.client_documents (client_id, template_id, title, description, type, content, filled_variables, account_owner_id)
      SELECT v_link.client_id, dt.id, COALESCE(v_link.template_snapshot->>'title', dt.title),
        'Preenchido via link em ' || to_char(now(), 'DD/MM/YYYY" às "HH24:MI'),
        CASE WHEN dt.category IN ('anamnese','contract','consent') THEN dt.category::public.document_type ELSE 'other'::public.document_type END,
        p_filled_content, COALESCE(p_filled_variables, '{}'::jsonb), v_owner
      FROM public.document_templates dt WHERE dt.id = v_link.template_id AND dt.account_owner_id = v_owner
      RETURNING id INTO v_document_id;
    END IF;
  END IF;
  RETURN COALESCE(v_document_id, v_link.id);
END;
$function$;
REVOKE ALL ON FUNCTION public.submit_document_fill_by_token(text,text,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_document_fill_by_token(text,text,jsonb,text) TO service_role;

-- Keep the public signatures stable; return saved answers only through CPF-authenticated lookup.
DO $migration$
DECLARE v_def text; v_updated text;
BEGIN
  v_def := pg_get_functiondef('public.get_document_fill_link_by_token(text)'::regprocedure);
  v_updated := replace(v_def,
    '''filled_at'', rec.filled_at, ''filled_content'', rec.filled_content, ''filled_variables'', v_filled_vars,',
    '''filled_at'', rec.filled_at, ''filled_content'', CASE WHEN EXISTS (SELECT 1 FROM public.clients c WHERE c.id = rec.client_id AND length(regexp_replace(COALESCE(c.cpf, ''''), ''\D'', '''', ''g'')) = 11) THEN NULL ELSE rec.filled_content END, ''filled_variables'', CASE WHEN EXISTS (SELECT 1 FROM public.clients c WHERE c.id = rec.client_id AND length(regexp_replace(COALESCE(c.cpf, ''''), ''\D'', '''', ''g'')) = 11) THEN jsonb_build_object(''__prefill'', COALESCE(v_filled_vars->''__prefill'', ''{}''::jsonb)) ELSE v_filled_vars END,');
  IF v_updated = v_def THEN RAISE EXCEPTION 'Expected public document lookup definition not found'; END IF;
  EXECUTE v_updated;
  v_def := pg_get_functiondef('public.authenticate_document_fill_link(text,text)'::regprocedure);
  v_updated := replace(v_def, '''ok'', true,', '''ok'', true, ''filled_content'', rec.filled_content, ''filled_at'', rec.filled_at,');
  IF v_updated = v_def THEN RAISE EXCEPTION 'Expected CPF document lookup definition not found'; END IF;
  EXECUTE v_updated;
END $migration$;