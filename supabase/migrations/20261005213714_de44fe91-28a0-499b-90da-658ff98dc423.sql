CREATE TABLE public.client_consultation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  raw_notes text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  account_owner_id uuid DEFAULT public.current_account_owner_id(),
  owner_professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  visibility public.data_visibility NOT NULL DEFAULT 'shared',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_consultation_notes TO authenticated;
GRANT ALL ON public.client_consultation_notes TO service_role;
ALTER TABLE public.client_consultation_notes ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_ccn_client ON public.client_consultation_notes(client_id, created_at DESC);

CREATE POLICY tenant_isolation_restrictive ON public.client_consultation_notes AS RESTRICTIVE FOR ALL TO authenticated
  USING (account_owner_id = public.current_account_owner_id())
  WITH CHECK (account_owner_id = public.current_account_owner_id());
CREATE POLICY block_super_admin_tenant_read ON public.client_consultation_notes AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.assert_not_super_admin_reading_tenant()) WITH CHECK (public.assert_not_super_admin_reading_tenant());
CREATE POLICY ccn_select ON public.client_consultation_notes FOR SELECT TO authenticated
  USING (public.can_access_client_record(client_id) AND public.can_see_record(owner_professional_id, visibility, 'documentos'));
CREATE POLICY ccn_insert ON public.client_consultation_notes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND public.can_access_client_record(client_id));
CREATE POLICY ccn_update ON public.client_consultation_notes FOR UPDATE TO authenticated
  USING (public.can_access_client_record(client_id) AND public.can_write_record(owner_professional_id, 'documentos', 'edit'))
  WITH CHECK (public.can_access_client_record(client_id));
CREATE POLICY ccn_delete ON public.client_consultation_notes FOR DELETE TO authenticated
  USING (public.can_access_client_record(client_id) AND public.can_write_record(owner_professional_id, 'documentos', 'delete'));

CREATE OR REPLACE FUNCTION public.ccn_touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER ccn_updated_at BEFORE UPDATE ON public.client_consultation_notes FOR EACH ROW EXECUTE FUNCTION public.ccn_touch_updated_at();
CREATE TRIGGER ccn_audit AFTER INSERT OR UPDATE OR DELETE ON public.client_consultation_notes FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

ALTER PUBLICATION supabase_realtime ADD TABLE public.client_consultation_notes;