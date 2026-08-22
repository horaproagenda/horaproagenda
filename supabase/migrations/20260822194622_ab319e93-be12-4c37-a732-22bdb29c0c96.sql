-- FASE 1: base de permissões e visibilidade

-- 1. Novos módulos
ALTER TYPE public.app_module ADD VALUE IF NOT EXISTS 'unidades';
ALTER TYPE public.app_module ADD VALUE IF NOT EXISTS 'salas_compartilhadas';

-- 2. Ampliar user_permissions
ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS can_export boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_print boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_values boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_others boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_share boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_edit_others boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_delete_others boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_scope text NOT NULL DEFAULT 'shared';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_permissions_data_scope_check'
  ) THEN
    ALTER TABLE public.user_permissions
      ADD CONSTRAINT user_permissions_data_scope_check
      CHECK (data_scope IN ('own','shared','unit','all'));
  END IF;
END $$;

-- 3. Enum de visibilidade
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'data_visibility') THEN
    CREATE TYPE public.data_visibility AS ENUM ('private','shared','clinic');
  END IF;
END $$;

-- 4. Colunas de propriedade/visibilidade
ALTER TABLE public.clients            ADD COLUMN IF NOT EXISTS owner_professional_id uuid, ADD COLUMN IF NOT EXISTS visibility public.data_visibility;
ALTER TABLE public.services           ADD COLUMN IF NOT EXISTS owner_professional_id uuid, ADD COLUMN IF NOT EXISTS visibility public.data_visibility;
ALTER TABLE public.package_templates  ADD COLUMN IF NOT EXISTS owner_professional_id uuid, ADD COLUMN IF NOT EXISTS visibility public.data_visibility;
ALTER TABLE public.service_packages   ADD COLUMN IF NOT EXISTS owner_professional_id uuid, ADD COLUMN IF NOT EXISTS visibility public.data_visibility;
ALTER TABLE public.products           ADD COLUMN IF NOT EXISTS owner_professional_id uuid, ADD COLUMN IF NOT EXISTS visibility public.data_visibility;
ALTER TABLE public.client_documents   ADD COLUMN IF NOT EXISTS owner_professional_id uuid, ADD COLUMN IF NOT EXISTS visibility public.data_visibility;
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS owner_professional_id uuid, ADD COLUMN IF NOT EXISTS visibility public.data_visibility;

-- Dados existentes permanecem visíveis para toda a clínica
UPDATE public.clients            SET visibility = 'clinic' WHERE visibility IS NULL;
UPDATE public.services           SET visibility = 'clinic' WHERE visibility IS NULL;
UPDATE public.package_templates  SET visibility = 'clinic' WHERE visibility IS NULL;
UPDATE public.service_packages   SET visibility = 'clinic' WHERE visibility IS NULL;
UPDATE public.products           SET visibility = 'clinic' WHERE visibility IS NULL;
UPDATE public.client_documents   SET visibility = 'clinic' WHERE visibility IS NULL;
UPDATE public.document_templates SET visibility = 'clinic' WHERE visibility IS NULL;

CREATE INDEX IF NOT EXISTS idx_clients_owner_prof ON public.clients(owner_professional_id);
CREATE INDEX IF NOT EXISTS idx_services_owner_prof ON public.services(owner_professional_id);
CREATE INDEX IF NOT EXISTS idx_products_owner_prof ON public.products(owner_professional_id);
CREATE INDEX IF NOT EXISTS idx_package_templates_owner_prof ON public.package_templates(owner_professional_id);

-- 5. Funções de decisão
CREATE OR REPLACE FUNCTION public.is_account_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _user_id AND coalesce(p.account_owner_id, p.id) = p.id
    )
  );
$$;

-- Permissão por módulo/ação. Admin sempre true.
CREATE OR REPLACE FUNCTION public.perm(_module text, _action text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.user_permissions;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF public.is_account_admin(auth.uid()) THEN RETURN true; END IF;

  SELECT * INTO r FROM public.user_permissions
   WHERE user_id = auth.uid() AND module::text = _module LIMIT 1;

  IF r.id IS NULL THEN
    -- Sem linha configurada: apenas leitura de dados da clínica
    RETURN _action = 'view';
  END IF;

  RETURN CASE _action
    WHEN 'view'          THEN r.can_view
    WHEN 'create'        THEN r.can_create
    WHEN 'edit'          THEN r.can_edit
    WHEN 'delete'        THEN r.can_delete
    WHEN 'edit_others'   THEN r.can_edit_others
    WHEN 'delete_others' THEN r.can_delete_others
    WHEN 'export'        THEN r.can_export
    WHEN 'print'         THEN r.can_print
    WHEN 'view_values'   THEN r.can_view_values
    WHEN 'view_others'   THEN r.can_view_others
    WHEN 'share'         THEN r.can_share
    ELSE false
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.perm_scope(_module text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s text;
BEGIN
  IF public.is_account_admin(auth.uid()) THEN RETURN 'all'; END IF;
  SELECT data_scope INTO s FROM public.user_permissions
   WHERE user_id = auth.uid() AND module::text = _module LIMIT 1;
  RETURN coalesce(s, 'shared');
END;
$$;

-- Pode VER um registro conforme dono + visibilidade + escopo
CREATE OR REPLACE FUNCTION public.can_see_record(_owner uuid, _visibility public.data_visibility, _module text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE mine uuid; scope text;
BEGIN
  IF public.is_account_admin(auth.uid()) OR public.is_super_admin(auth.uid()) THEN RETURN true; END IF;
  IF _owner IS NULL THEN RETURN true; END IF; -- dado geral da clínica

  mine := public.get_professional_id_for_user(auth.uid());
  IF mine IS NOT NULL AND mine = _owner THEN RETURN true; END IF;

  scope := public.perm_scope(_module);
  RETURN CASE coalesce(_visibility, 'clinic')
    WHEN 'private' THEN false
    WHEN 'shared'  THEN scope IN ('shared','unit','all') OR public.perm(_module, 'view_others')
    ELSE scope <> 'own' OR public.perm(_module, 'view_others')
  END;
END;
$$;

-- Pode ESCREVER (edit/delete) conforme dono
CREATE OR REPLACE FUNCTION public.can_write_record(_owner uuid, _module text, _action text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE mine uuid;
BEGIN
  IF public.is_account_admin(auth.uid()) THEN RETURN true; END IF;
  mine := public.get_professional_id_for_user(auth.uid());
  IF _owner IS NULL OR mine IS NULL OR mine <> _owner THEN
    RETURN public.perm(_module, _action || '_others');
  END IF;
  RETURN public.perm(_module, _action);
END;
$$;

-- 6. Autofill de dono/visibilidade
CREATE OR REPLACE FUNCTION public.tg_autofill_owner_visibility()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE mine uuid;
BEGIN
  IF NEW.owner_professional_id IS NULL AND auth.uid() IS NOT NULL
     AND NOT public.is_account_admin(auth.uid()) THEN
    mine := public.get_professional_id_for_user(auth.uid());
    NEW.owner_professional_id := mine;
  END IF;

  IF NEW.visibility IS NULL THEN
    NEW.visibility := CASE
      WHEN NEW.owner_professional_id IS NULL THEN 'clinic'::public.data_visibility
      ELSE 'private'::public.data_visibility
    END;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients','services','package_templates','service_packages','products','client_documents','document_templates']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_owner_visibility ON public.%I', t);
    EXECUTE format('CREATE TRIGGER tg_owner_visibility BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_autofill_owner_visibility()', t);
  END LOOP;
END $$;

-- 7. RLS RESTRICTIVE de privacidade (soma-se ao isolamento de tenant existente)
DO $$
DECLARE rec record;
BEGIN
  FOR rec IN SELECT * FROM (VALUES
      ('clients','clientes'),
      ('services','servicos'),
      ('package_templates','servicos'),
      ('service_packages','servicos'),
      ('products','produtos'),
      ('client_documents','documentos'),
      ('document_templates','documentos')
  ) AS v(tbl, module)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS privacy_visibility_select ON public.%I', rec.tbl);
    EXECUTE format($f$CREATE POLICY privacy_visibility_select ON public.%I
      AS RESTRICTIVE FOR SELECT TO authenticated
      USING (public.can_see_record(owner_professional_id, visibility, %L))$f$, rec.tbl, rec.module);

    EXECUTE format('DROP POLICY IF EXISTS privacy_visibility_update ON public.%I', rec.tbl);
    EXECUTE format($f$CREATE POLICY privacy_visibility_update ON public.%I
      AS RESTRICTIVE FOR UPDATE TO authenticated
      USING (public.can_write_record(owner_professional_id, %L, 'edit'))$f$, rec.tbl, rec.module);

    EXECUTE format('DROP POLICY IF EXISTS privacy_visibility_delete ON public.%I', rec.tbl);
    EXECUTE format($f$CREATE POLICY privacy_visibility_delete ON public.%I
      AS RESTRICTIVE FOR DELETE TO authenticated
      USING (public.can_write_record(owner_professional_id, %L, 'delete'))$f$, rec.tbl, rec.module);
  END LOOP;
END $$;

-- 8. Auditoria de alterações de permissão e visibilidade
CREATE OR REPLACE FUNCTION public.tg_audit_permission_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    auth.uid(),
    lower(TG_OP),
    TG_TABLE_NAME,
    coalesce(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tg_audit_user_permissions ON public.user_permissions;
CREATE TRIGGER tg_audit_user_permissions
AFTER INSERT OR UPDATE OR DELETE ON public.user_permissions
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_permission_change();

-- 9. Correção de segurança: política de super admin deve ser RESTRICTIVE
DROP POLICY IF EXISTS block_super_admin_tenant_read_product_usage_records ON public.product_usage_records;
CREATE POLICY block_super_admin_tenant_read_product_usage_records
ON public.product_usage_records AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT public.is_super_admin(auth.uid()));