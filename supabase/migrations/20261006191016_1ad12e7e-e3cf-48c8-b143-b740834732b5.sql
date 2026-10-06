CREATE OR REPLACE FUNCTION public.can_see_record(_owner uuid, _visibility data_visibility, _module text)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE mine uuid; scope text;
BEGIN
  IF public.is_super_admin(auth.uid()) THEN RETURN true; END IF;
  mine := public.get_professional_id_for_user(auth.uid());
  IF _owner IS NOT NULL AND mine IS NOT NULL AND mine = _owner THEN RETURN true; END IF;

  IF _module = 'documentos' AND _owner IS NULL AND coalesce(_visibility, 'clinic') = 'clinic' THEN
    RETURN public.is_account_admin(auth.uid())
        OR public.has_role(auth.uid(), 'receptionist')
        OR public.professional_permission('can_view_all_documents');
  END IF;

  IF _owner IS NULL THEN RETURN true; END IF;
  -- Privado (somente eu): ninguém além do dono.
  IF _visibility = 'private' THEN RETURN false; END IF;
  IF coalesce(_visibility, 'clinic') = 'clinic' THEN RETURN true; END IF;
  -- Compartilhado com autorizados
  IF NOT public.professional_share_flag(_owner, _module) THEN RETURN false; END IF;
  IF public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(), 'receptionist') THEN RETURN true; END IF;
  scope := public.perm_scope(_module);
  RETURN scope IN ('shared','unit','all') OR public.perm(_module, 'view_others');
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_autofill_owner_visibility()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE mine uuid; _mod text; _can_share boolean;
BEGIN
  IF auth.uid() IS NULL OR public.is_account_admin(auth.uid()) OR public.is_super_admin(auth.uid()) THEN
    IF TG_OP = 'INSERT' AND NEW.visibility IS NULL THEN
      NEW.visibility := CASE WHEN NEW.owner_professional_id IS NULL THEN 'clinic' ELSE 'private' END::public.data_visibility;
    END IF;
    RETURN NEW;
  END IF;

  _mod := CASE TG_TABLE_NAME
    WHEN 'clients' THEN 'clientes'
    WHEN 'products' THEN 'produtos'
    WHEN 'client_documents' THEN 'documentos'
    WHEN 'document_templates' THEN 'documentos'
    ELSE 'servicos' END;
  _can_share := public.perm(_mod, 'share');

  IF TG_OP = 'INSERT' THEN
    IF NEW.owner_professional_id IS NULL THEN
      mine := public.get_professional_id_for_user(auth.uid());
      NEW.owner_professional_id := mine;
    END IF;
    IF NOT _can_share OR NEW.visibility IS NULL THEN
      NEW.visibility := CASE WHEN NEW.owner_professional_id IS NULL THEN 'clinic' ELSE 'private' END::public.data_visibility;
    END IF;
  ELSIF NOT _can_share THEN
    -- Sem permissão de compartilhar: não pode mudar privacidade nem dono.
    NEW.visibility := OLD.visibility;
    NEW.owner_professional_id := OLD.owner_professional_id;
  END IF;
  RETURN NEW;
END;
$function$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['clients','services','package_templates','service_packages','products','client_documents','document_templates'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_owner_visibility ON public.%I', t);
    EXECUTE format('CREATE TRIGGER tg_owner_visibility BEFORE INSERT OR UPDATE OF visibility, owner_professional_id ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_autofill_owner_visibility()', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Authorized users can insert document templates" ON public.document_templates;
CREATE POLICY "Authorized users can insert document templates" ON public.document_templates FOR INSERT TO authenticated
WITH CHECK (is_account_admin(auth.uid()) OR has_role(auth.uid(), 'receptionist'::app_role)
  OR (has_role(auth.uid(), 'professional'::app_role) AND owner_professional_id = get_professional_id_for_user(auth.uid())
      AND (visibility = 'private'::data_visibility OR perm('documentos','share'))));

DROP POLICY IF EXISTS "Authorized users can update document templates" ON public.document_templates;
CREATE POLICY "Authorized users can update document templates" ON public.document_templates FOR UPDATE TO authenticated
USING (is_account_admin(auth.uid()) OR has_role(auth.uid(), 'receptionist'::app_role)
  OR (has_role(auth.uid(), 'professional'::app_role) AND owner_professional_id = get_professional_id_for_user(auth.uid())))
WITH CHECK (is_account_admin(auth.uid()) OR has_role(auth.uid(), 'receptionist'::app_role)
  OR (owner_professional_id = get_professional_id_for_user(auth.uid())
      AND (visibility = 'private'::data_visibility OR perm('documentos','share'))));