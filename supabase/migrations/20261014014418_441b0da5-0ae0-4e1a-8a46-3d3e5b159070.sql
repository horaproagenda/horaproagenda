CREATE TABLE public.procedure_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_id uuid,
  name text NOT NULL,
  slug text NOT NULL,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  version int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.procedure_templates TO authenticated;
GRANT ALL ON public.procedure_templates TO service_role;
ALTER TABLE public.procedure_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pt_select" ON public.procedure_templates FOR SELECT TO authenticated
  USING (account_owner_id IS NULL OR account_owner_id = public.current_account_owner_id());
CREATE POLICY "pt_admin_insert" ON public.procedure_templates FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') AND account_owner_id = public.current_account_owner_id());
CREATE POLICY "pt_admin_update" ON public.procedure_templates FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND account_owner_id = public.current_account_owner_id());
CREATE POLICY "pt_admin_delete" ON public.procedure_templates FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND account_owner_id = public.current_account_owner_id());
CREATE TRIGGER pt_updated BEFORE UPDATE ON public.procedure_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE OR REPLACE FUNCTION public.bump_procedure_template_version() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN IF NEW.fields IS DISTINCT FROM OLD.fields OR NEW.name IS DISTINCT FROM OLD.name THEN NEW.version := OLD.version + 1; END IF; RETURN NEW; END $$;
CREATE TRIGGER pt_version BEFORE UPDATE ON public.procedure_templates FOR EACH ROW EXECUTE FUNCTION public.bump_procedure_template_version();

CREATE TABLE public.application_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  procedure_template_id uuid REFERENCES public.procedure_templates(id) ON DELETE SET NULL,
  procedure_name text NOT NULL,
  template_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  room text,
  reason text,
  status text NOT NULL DEFAULT 'draft',
  performed_at timestamptz NOT NULL DEFAULT now(),
  follow_up_date date,
  based_on_id uuid REFERENCES public.application_records(id) ON DELETE SET NULL,
  amends_id uuid REFERENCES public.application_records(id) ON DELETE SET NULL,
  amendment_reason text,
  created_by uuid DEFAULT auth.uid(),
  completed_at timestamptz,
  completed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.application_records(client_id, performed_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_records TO authenticated;
GRANT ALL ON public.application_records TO service_role;
ALTER TABLE public.application_records ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_receptionist_only() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.has_role(auth.uid(),'receptionist') AND NOT public.has_role(auth.uid(),'admin') AND NOT public.has_role(auth.uid(),'professional') $$;

CREATE OR REPLACE FUNCTION public.can_write_application(_rec_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.application_records r WHERE r.id=_rec_id
    AND r.account_owner_id = public.current_account_owner_id()
    AND r.status NOT IN ('completed','cancelled')
    AND (public.has_role(auth.uid(),'admin') OR r.professional_id = public.get_professional_id_for_user(auth.uid()))) $$;

CREATE OR REPLACE FUNCTION public.can_read_application_technical(_rec_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.application_records r WHERE r.id=_rec_id
    AND r.account_owner_id = public.current_account_owner_id()
    AND public.can_access_client_record(r.client_id)) AND NOT public.is_receptionist_only() $$;

CREATE POLICY "ar_tenant" ON public.application_records AS RESTRICTIVE FOR ALL TO authenticated
  USING (account_owner_id = public.current_account_owner_id()) WITH CHECK (account_owner_id = public.current_account_owner_id());
CREATE POLICY "ar_select" ON public.application_records FOR SELECT TO authenticated USING (public.can_access_client_record(client_id));
CREATE POLICY "ar_insert" ON public.application_records FOR INSERT TO authenticated
  WITH CHECK (public.can_access_client_record(client_id) AND NOT public.is_receptionist_only()
    AND (public.has_role(auth.uid(),'admin') OR professional_id = public.get_professional_id_for_user(auth.uid())));
CREATE POLICY "ar_update" ON public.application_records FOR UPDATE TO authenticated
  USING (status NOT IN ('completed','cancelled') AND (public.has_role(auth.uid(),'admin') OR professional_id = public.get_professional_id_for_user(auth.uid())));
CREATE POLICY "ar_delete" ON public.application_records FOR DELETE TO authenticated
  USING (status = 'draft' AND (public.has_role(auth.uid(),'admin') OR professional_id = public.get_professional_id_for_user(auth.uid())));
CREATE TRIGGER ar_owner BEFORE INSERT ON public.application_records FOR EACH ROW EXECUTE FUNCTION public.tg_autofill_account_owner_id();
CREATE TRIGGER ar_updated BEFORE UPDATE ON public.application_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.guard_application_record() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'APPLICATION_LOCKED' USING ERRCODE='P0001'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('completed','cancelled') AND current_setting('app.application_rpc', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'APPLICATION_LOCKED' USING ERRCODE='P0001';
  END IF;
  IF NEW.status='completed' AND OLD.status<>'completed' AND current_setting('app.application_rpc', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'APPLICATION_COMPLETE_VIA_RPC' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ar_guard BEFORE UPDATE OR DELETE ON public.application_records FOR EACH ROW EXECUTE FUNCTION public.guard_application_record();

CREATE TABLE public.application_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.application_records(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name_snapshot text NOT NULL DEFAULT '',
  manufacturer_snapshot text,
  lot_number text,
  expiration_date date,
  region text NOT NULL DEFAULT '',
  side text,
  quantity numeric,
  unit text NOT NULL DEFAULT 'ml',
  technique text,
  dilution text,
  instrument text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.application_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.application_records(id) ON DELETE CASCADE,
  field_id text NOT NULL,
  value text,
  UNIQUE (application_id, field_id)
);
CREATE TABLE public.application_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.application_records(id) ON DELETE CASCADE,
  attachment_type text NOT NULL,
  photo_id uuid REFERENCES public.treatment_photos(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.client_documents(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_items, public.application_field_values, public.application_attachments TO authenticated;
GRANT ALL ON public.application_items, public.application_field_values, public.application_attachments TO service_role;
ALTER TABLE public.application_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_select" ON public.application_items FOR SELECT TO authenticated USING (public.can_read_application_technical(application_id));
CREATE POLICY "ai_write" ON public.application_items FOR ALL TO authenticated USING (public.can_write_application(application_id)) WITH CHECK (public.can_write_application(application_id));
CREATE POLICY "afv_select" ON public.application_field_values FOR SELECT TO authenticated USING (public.can_read_application_technical(application_id));
CREATE POLICY "afv_write" ON public.application_field_values FOR ALL TO authenticated USING (public.can_write_application(application_id)) WITH CHECK (public.can_write_application(application_id));
CREATE POLICY "aa_select" ON public.application_attachments FOR SELECT TO authenticated USING (public.can_read_application_technical(application_id));
CREATE POLICY "aa_write" ON public.application_attachments FOR ALL TO authenticated USING (public.can_write_application(application_id)) WITH CHECK (public.can_write_application(application_id));

CREATE OR REPLACE FUNCTION public.complete_application_record(_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.application_records; f jsonb; missing text[] := '{}'; n int;
BEGIN
  SELECT * INTO r FROM public.application_records WHERE id=_id AND account_owner_id=public.current_account_owner_id();
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
  IF NOT (public.has_role(auth.uid(),'admin') OR r.professional_id = public.get_professional_id_for_user(auth.uid())) THEN
    RETURN jsonb_build_object('ok',false,'code','FORBIDDEN'); END IF;
  IF r.status IN ('completed','cancelled') THEN RETURN jsonb_build_object('ok',false,'code','ALREADY_LOCKED'); END IF;
  IF r.professional_id IS NULL THEN missing := missing || 'Profissional'; END IF;
  IF coalesce(trim(r.procedure_name),'')='' THEN missing := missing || 'Procedimento'; END IF;
  SELECT count(*) INTO n FROM public.application_items WHERE application_id=_id;
  IF n=0 THEN missing := missing || 'Ao menos um item aplicado'; END IF;
  IF EXISTS (SELECT 1 FROM public.application_items WHERE application_id=_id AND (coalesce(trim(region),'')='' OR coalesce(trim(product_name_snapshot),'')='' OR quantity IS NULL OR quantity<=0 OR coalesce(trim(unit),'')='')) THEN
    missing := missing || 'Itens: produto, região, quantidade maior que zero e unidade'; END IF;
  FOR f IN SELECT * FROM jsonb_array_elements(coalesce(r.template_snapshot->'fields','[]'::jsonb)) LOOP
    IF coalesce((f->>'required')::boolean,false) AND NOT EXISTS (SELECT 1 FROM public.application_field_values v WHERE v.application_id=_id AND v.field_id=f->>'id' AND coalesce(trim(v.value),'')<>'') THEN
      missing := missing || (f->>'label'); END IF;
  END LOOP;
  IF array_length(missing,1) > 0 THEN RETURN jsonb_build_object('ok',false,'code','MISSING','missing',to_jsonb(missing)); END IF;
  PERFORM set_config('app.application_rpc','1',true);
  UPDATE public.application_records SET status='completed', completed_at=now(), completed_by=auth.uid() WHERE id=_id;
  RETURN jsonb_build_object('ok',true);
END $$;

CREATE OR REPLACE FUNCTION public.cancel_application_record(_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.application_records;
BEGIN
  SELECT * INTO r FROM public.application_records WHERE id=_id AND account_owner_id=public.current_account_owner_id();
  IF NOT FOUND OR NOT (public.has_role(auth.uid(),'admin') OR r.professional_id = public.get_professional_id_for_user(auth.uid())) THEN
    RETURN jsonb_build_object('ok',false,'code','FORBIDDEN'); END IF;
  IF r.status IN ('completed','cancelled') THEN RETURN jsonb_build_object('ok',false,'code','ALREADY_LOCKED'); END IF;
  PERFORM set_config('app.application_rpc','1',true);
  UPDATE public.application_records SET status='cancelled' WHERE id=_id;
  RETURN jsonb_build_object('ok',true);
END $$;

-- Retificação: cria nova ficha (rascunho) copiando tudo, ligada à original
CREATE OR REPLACE FUNCTION public.amend_application_record(_id uuid, _reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.application_records; new_id uuid;
BEGIN
  IF coalesce(trim(_reason),'')='' THEN RETURN jsonb_build_object('ok',false,'code','REASON_REQUIRED'); END IF;
  SELECT * INTO r FROM public.application_records WHERE id=_id AND account_owner_id=public.current_account_owner_id();
  IF NOT FOUND OR NOT (public.has_role(auth.uid(),'admin') OR r.professional_id = public.get_professional_id_for_user(auth.uid())) THEN
    RETURN jsonb_build_object('ok',false,'code','FORBIDDEN'); END IF;
  IF r.status <> 'completed' THEN RETURN jsonb_build_object('ok',false,'code','NOT_COMPLETED'); END IF;
  INSERT INTO public.application_records(account_owner_id,client_id,professional_id,procedure_template_id,procedure_name,template_snapshot,appointment_id,room,reason,status,performed_at,follow_up_date,amends_id,amendment_reason,created_by)
  VALUES (r.account_owner_id,r.client_id,r.professional_id,r.procedure_template_id,r.procedure_name,r.template_snapshot,r.appointment_id,r.room,r.reason,'in_progress',r.performed_at,r.follow_up_date,r.id,_reason,auth.uid())
  RETURNING id INTO new_id;
  INSERT INTO public.application_items(application_id,position,product_id,product_name_snapshot,manufacturer_snapshot,lot_number,expiration_date,region,side,quantity,unit,technique,dilution,instrument,notes)
    SELECT new_id,position,product_id,product_name_snapshot,manufacturer_snapshot,lot_number,expiration_date,region,side,quantity,unit,technique,dilution,instrument,notes FROM public.application_items WHERE application_id=_id;
  INSERT INTO public.application_field_values(application_id,field_id,value) SELECT new_id,field_id,value FROM public.application_field_values WHERE application_id=_id;
  INSERT INTO public.application_attachments(application_id,attachment_type,photo_id,document_id) SELECT new_id,attachment_type,photo_id,document_id FROM public.application_attachments WHERE application_id=_id;
  PERFORM set_config('app.application_rpc','1',true);
  UPDATE public.application_records SET status='amended' WHERE id=_id;
  RETURN jsonb_build_object('ok',true,'id',new_id);
END $$;
REVOKE ALL ON FUNCTION public.complete_application_record(uuid), public.cancel_application_record(uuid), public.amend_application_record(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.complete_application_record(uuid), public.cancel_application_record(uuid), public.amend_application_record(uuid,text) TO authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='audit_trigger_function') THEN
    EXECUTE 'CREATE TRIGGER ar_audit AFTER INSERT OR UPDATE OR DELETE ON public.application_records FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function()';
  END IF;
END $$;

INSERT INTO public.procedure_templates(account_owner_id,name,slug,fields) VALUES
(NULL,'Preenchimento','preenchimento','[{"id":"objetivo_cliente","label":"Objetivo do cliente","type":"textarea","required":true},{"id":"regiao_alvo","label":"Região","type":"select","options":["Lábios","Olheiras","Mento","Contorno facial","Malar","Sulco nasogeniano"],"required":true}]'),
(NULL,'Toxina botulínica','toxina-botulinica','[{"id":"areas","label":"Áreas tratadas","type":"textarea","required":true},{"id":"unidades_total","label":"Total de unidades","type":"number","required":false}]'),
(NULL,'Bioestimulador','bioestimulador','[{"id":"objetivo_cliente","label":"Objetivo do cliente","type":"textarea","required":true},{"id":"sessao","label":"Número da sessão","type":"number","required":false}]'),
(NULL,'Skinbooster','skinbooster','[{"id":"objetivo_cliente","label":"Objetivo do cliente","type":"textarea","required":true}]'),
(NULL,'Laser','laser','[{"id":"equipamento","label":"Equipamento","type":"text","required":true},{"id":"parametros","label":"Parâmetros","type":"textarea","required":false},{"id":"fototipo","label":"Fototipo","type":"select","options":["I","II","III","IV","V","VI"],"required":false}]'),
(NULL,'Peeling','peeling','[{"id":"agente","label":"Agente / concentração","type":"text","required":true},{"id":"tempo_exposicao","label":"Tempo de exposição","type":"text","required":false}]'),
(NULL,'Microagulhamento','microagulhamento','[{"id":"profundidade","label":"Profundidade das agulhas","type":"text","required":false},{"id":"ativo","label":"Ativo associado","type":"text","required":false}]'),
(NULL,'Procedimento personalizado','personalizado','[]');