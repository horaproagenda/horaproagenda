ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.document_fill_links ADD COLUMN IF NOT EXISTS template_version integer;
ALTER TABLE public.document_fill_links ADD COLUMN IF NOT EXISTS template_snapshot jsonb;

CREATE OR REPLACE FUNCTION public.bump_document_template_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content OR NEW.title IS DISTINCT FROM OLD.title THEN
    NEW.version := COALESCE(OLD.version, 1) + 1;
  ELSE
    NEW.version := OLD.version;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_bump_document_template_version ON public.document_templates;
CREATE TRIGGER trg_bump_document_template_version BEFORE UPDATE ON public.document_templates
FOR EACH ROW EXECUTE FUNCTION public.bump_document_template_version();

-- Congela o modelo no link. Título/texto/versão vêm SEMPRE do banco; a lista de campos vem do app.
CREATE OR REPLACE FUNCTION public.freeze_document_fill_link_template()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.document_templates%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.document_templates WHERE id = NEW.template_id;
  IF FOUND THEN
    NEW.template_version := t.version;
    NEW.template_snapshot := jsonb_build_object(
      'id', t.id, 'title', t.title, 'content', t.content,
      'variables', to_jsonb(COALESCE(t.variables, '{}'::text[])),
      'version', t.version,
      'fields', COALESCE(NEW.template_snapshot->'fields', '[]'::jsonb)
    );
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_freeze_document_fill_link_template ON public.document_fill_links;
CREATE TRIGGER trg_freeze_document_fill_link_template BEFORE INSERT ON public.document_fill_links
FOR EACH ROW EXECUTE FUNCTION public.freeze_document_fill_link_template();

CREATE TABLE IF NOT EXISTS public.document_events (
  id bigserial PRIMARY KEY,
  link_id uuid NOT NULL,
  account_owner_id uuid,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.document_events TO authenticated;
GRANT ALL ON public.document_events TO service_role;
ALTER TABLE public.document_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Conta vê eventos dos seus documentos" ON public.document_events
FOR SELECT TO authenticated USING (account_owner_id = public.current_account_owner_id());
CREATE INDEX IF NOT EXISTS idx_document_events_link ON public.document_events(link_id, created_at);

CREATE OR REPLACE FUNCTION public.log_document_event(p_token text, p_event text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_link public.document_fill_links%ROWTYPE;
BEGIN
  IF p_event NOT IN ('link_opened','preview_generated','preview_validated','preview_rejected') THEN RETURN; END IF;
  SELECT * INTO v_link FROM public.document_fill_links WHERE token = p_token LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.document_events(link_id, account_owner_id, event_type, payload)
  VALUES (v_link.id, v_link.account_owner_id, p_event, COALESCE(p_payload, '{}'::jsonb) - 'value');
END $$;
GRANT EXECUTE ON FUNCTION public.log_document_event(text, text, jsonb) TO anon, authenticated;

-- Leitura do link: usa a cópia congelada do modelo quando existir.
CREATE OR REPLACE FUNCTION public.get_document_fill_link_by_token(p_token text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  rec public.document_fill_links%ROWTYPE;
  v_template jsonb; v_prefill jsonb; v_filled_vars jsonb;
BEGIN
  SELECT * INTO rec FROM public.document_fill_links
  WHERE token = p_token AND (expires_at IS NULL OR expires_at > now()) LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF rec.template_snapshot IS NOT NULL AND rec.template_snapshot ? 'content' THEN
    v_template := jsonb_build_object(
      'id', rec.template_id,
      'title', rec.template_snapshot->>'title',
      'content', rec.template_snapshot->>'content',
      'variables', COALESCE(rec.template_snapshot->'variables', '[]'::jsonb));
  ELSE
    SELECT jsonb_build_object('id', id, 'title', title, 'content', content, 'variables', to_jsonb(COALESCE(variables, '{}'::text[])))
    INTO v_template FROM public.document_templates WHERE id = rec.template_id;
  END IF;

  v_filled_vars := COALESCE(rec.filled_variables, '{}'::jsonb);
  IF v_filled_vars ? '__prefill' THEN
    v_prefill := v_filled_vars->'__prefill';
    IF v_prefill ? 'client' THEN
      v_prefill := jsonb_set(v_prefill, '{client}', (v_prefill->'client') - 'cpf' - 'birthdate' - 'phone');
    END IF;
    IF v_prefill ? 'formData' THEN
      v_prefill := jsonb_set(v_prefill, '{formData}', (v_prefill->'formData')
        - 'cpf' - 'telefone' - 'data_nascimento' - 'nascimento' - 'idade' - 'idade_cliente');
    END IF;
    v_filled_vars := jsonb_set(v_filled_vars, '{__prefill}', v_prefill);
  END IF;

  RETURN jsonb_build_object(
    'id', rec.id, 'template_id', rec.template_id, 'client_id', rec.client_id,
    'professional_id', rec.professional_id, 'status', rec.status, 'expires_at', rec.expires_at,
    'filled_at', rec.filled_at, 'filled_content', rec.filled_content, 'filled_variables', v_filled_vars,
    'template', v_template,
    'template_version', rec.template_version,
    'template_fields', COALESCE(rec.template_snapshot->'fields', '[]'::jsonb),
    'requires_cpf', EXISTS (SELECT 1 FROM public.clients c WHERE c.id = rec.client_id
      AND c.cpf IS NOT NULL AND length(regexp_replace(c.cpf, '\D', '', 'g')) = 11));
END;
$function$;

-- Envio validado campo a campo. Recusas são registradas e devolvidas sem erro técnico.
CREATE OR REPLACE FUNCTION public.submit_document_fill_validated(
  p_token text, p_filled_content text, p_filled_variables jsonb, p_fields jsonb,
  p_template_version integer DEFAULT NULL, p_cpf text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_link public.document_fill_links%ROWTYPE;
  v_defs jsonb; v_reason text; v_detail text; v_doc uuid;
  v_ids text[];
BEGIN
  SELECT * INTO v_link FROM public.document_fill_links WHERE token = p_token LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'LINK_NOT_FOUND'); END IF;
  IF v_link.status = 'filled' THEN
    RETURN jsonb_build_object('ok', true, 'document_id',
      public.submit_document_fill_by_token(p_token, p_filled_content, p_filled_variables, p_cpf));
  END IF;
  IF p_fields IS NULL OR jsonb_typeof(p_fields) <> 'array' THEN
    v_reason := 'FIELDS_INVALID';
  END IF;

  v_defs := COALESCE(v_link.template_snapshot->'fields', '[]'::jsonb);

  IF v_reason IS NULL AND v_link.template_version IS NOT NULL
     AND p_template_version IS DISTINCT FROM v_link.template_version THEN
    v_reason := 'VERSION_MISMATCH';
    v_detail := format('enviado %s, link %s', p_template_version, v_link.template_version);
  END IF;

  IF v_reason IS NULL THEN
    SELECT array_agg(f->>'field_id') INTO v_ids FROM jsonb_array_elements(p_fields) f;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_fields) f WHERE COALESCE(f->>'field_id','') = '') THEN
      v_reason := 'FIELD_WITHOUT_ID';
    ELSIF EXISTS (SELECT 1 FROM unnest(COALESCE(v_ids, '{}')) i GROUP BY i HAVING count(*) > 1) THEN
      v_reason := 'FIELD_DUPLICATE';
      SELECT string_agg(i, ', ') INTO v_detail FROM (SELECT i FROM unnest(v_ids) i GROUP BY i HAVING count(*) > 1) d;
    END IF;
  END IF;

  IF v_reason IS NULL AND jsonb_array_length(v_defs) > 0 THEN
    SELECT string_agg(f->>'field_id', ', ') INTO v_detail
    FROM jsonb_array_elements(p_fields) f
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_defs) d WHERE d->>'field_id' = f->>'field_id');
    IF v_detail IS NOT NULL THEN v_reason := 'FIELD_UNKNOWN'; END IF;

    IF v_reason IS NULL THEN
      SELECT string_agg(d->>'field_id', ', ') INTO v_detail
      FROM jsonb_array_elements(v_defs) d
      WHERE COALESCE((d->>'required')::boolean, false)
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_fields) f
          WHERE f->>'field_id' = d->>'field_id' AND length(trim(COALESCE(f->>'value',''))) > 0);
      IF v_detail IS NOT NULL THEN v_reason := 'FIELD_REQUIRED'; END IF;
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    INSERT INTO public.document_events(link_id, account_owner_id, event_type, payload)
    VALUES (v_link.id, v_link.account_owner_id, 'submit_rejected', jsonb_build_object('reason', v_reason, 'detail', v_detail));
    RETURN jsonb_build_object('ok', false, 'reason', v_reason, 'detail', v_detail);
  END IF;

  v_doc := public.submit_document_fill_by_token(
    p_token, p_filled_content,
    COALESCE(p_filled_variables, '{}'::jsonb)
      || jsonb_build_object('__fields', p_fields, '__template_version', v_link.template_version),
    p_cpf);

  INSERT INTO public.document_events(link_id, account_owner_id, event_type, payload)
  VALUES (v_link.id, v_link.account_owner_id, 'document_finalized',
    jsonb_build_object('document_id', v_doc, 'template_version', v_link.template_version,
      'field_count', jsonb_array_length(p_fields)));
  RETURN jsonb_build_object('ok', true, 'document_id', v_doc);
END $$;
GRANT EXECUTE ON FUNCTION public.submit_document_fill_validated(text, text, jsonb, jsonb, integer, text) TO anon, authenticated;