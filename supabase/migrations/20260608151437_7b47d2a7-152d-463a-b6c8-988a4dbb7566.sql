
-- 1) Pool UltraMsg: apenas super_admin
DROP POLICY IF EXISTS "Admins manage ultramsg pool" ON public.ultramsg_instance_pool;
DROP POLICY IF EXISTS "Admins view ultramsg pool" ON public.ultramsg_instance_pool;

CREATE POLICY "Super admin manages ultramsg pool"
  ON public.ultramsg_instance_pool FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- 2) Credenciais por profissional: super_admin gerencia tudo; admin comum perde acesso
DROP POLICY IF EXISTS "Admin full access to whatsapp credentials" ON public.professional_whatsapp_credentials;

CREATE POLICY "Super admin full access to whatsapp credentials"
  ON public.professional_whatsapp_credentials FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- 3) Esconder colunas sensíveis (instance_id, token, api_url) de qualquer usuário autenticado
--    Edge Functions usam service_role e continuam funcionando normalmente.
REVOKE SELECT ON public.professional_whatsapp_credentials FROM authenticated;
GRANT SELECT (professional_id, is_active, last_connected_at, last_checked_at, created_at, updated_at)
  ON public.professional_whatsapp_credentials TO authenticated;
-- Continuam podendo escrever (RLS controla quem)
GRANT INSERT, UPDATE, DELETE ON public.professional_whatsapp_credentials TO authenticated;
GRANT ALL ON public.professional_whatsapp_credentials TO service_role;
