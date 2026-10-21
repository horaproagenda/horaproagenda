CREATE OR REPLACE FUNCTION public.tg_client_document_type_from_template()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cat text;
BEGIN
  IF NEW.template_id IS NOT NULL THEN
    SELECT category::text INTO v_cat FROM public.document_templates WHERE id = NEW.template_id;
    IF v_cat IN ('anamnese','contract','consent') THEN
      NEW.type := v_cat::public.document_type;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_client_document_type_from_template ON public.client_documents;
CREATE TRIGGER tg_client_document_type_from_template
BEFORE INSERT OR UPDATE OF template_id, type ON public.client_documents
FOR EACH ROW EXECUTE FUNCTION public.tg_client_document_type_from_template();

UPDATE public.client_documents cd
SET type = dt.category::text::public.document_type
FROM public.document_templates dt
WHERE cd.template_id = dt.id
  AND dt.category IS NOT NULL
  AND cd.type::text IS DISTINCT FROM dt.category::text;

CREATE OR REPLACE FUNCTION public.get_document_fill_link_token(_link_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _token text; _owner uuid; _client uuid;
BEGIN
  SELECT token, account_owner_id, client_id INTO _token, _owner, _client
  FROM public.document_fill_links WHERE id = _link_id;
  IF _token IS NULL THEN RETURN NULL; END IF;
  IF _owner IS DISTINCT FROM public.current_account_owner_id() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
       OR (public.has_role(auth.uid(), 'professional'::public.app_role)
           AND (_client IS NULL OR public.can_access_client_record(_client)))) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN _token;
END $$;
REVOKE ALL ON FUNCTION public.get_document_fill_link_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_document_fill_link_token(uuid) TO authenticated;