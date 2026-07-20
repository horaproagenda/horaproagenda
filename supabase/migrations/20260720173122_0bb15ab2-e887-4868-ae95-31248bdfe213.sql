
-- Restaura os privilégios de tabela para o pool de instâncias UltraMsg.
-- Sem esses GRANTs, mesmo o Super Admin (autenticado) recebe erro de
-- permissão do PostgREST ao inserir/listar, apesar das policies de RLS
-- já limitarem tudo a super_admin.
--
-- Mantemos o token fora do SELECT do role `authenticated`: somente o
-- service_role (edge functions / RPCs SECURITY DEFINER) pode ler o token.
-- O UI do Super Admin apenas escreve o token no INSERT — nunca o lê de volta.

GRANT SELECT (
  id, api_url, instance_id, status, assigned_professional_id,
  assigned_at, notes, created_at, updated_at, monthly_cost_usd,
  activated_at, token_encrypted
) ON public.ultramsg_instance_pool TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.ultramsg_instance_pool TO authenticated;
GRANT ALL ON public.ultramsg_instance_pool TO service_role;

-- Garante que o token continua ilegível para clientes autenticados
REVOKE SELECT (token) ON public.ultramsg_instance_pool FROM authenticated;
REVOKE SELECT (token) ON public.ultramsg_instance_pool FROM anon;
