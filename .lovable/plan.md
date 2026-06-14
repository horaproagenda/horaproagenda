## Contexto

O app é multi-tenant: várias clínicas independentes usam o mesmo banco Supabase. Hoje, várias tabelas críticas **não têm `account_owner_id`**, e as RLS policies só checam `has_role('admin')` globalmente. Resultado: um admin da Clínica A consegue ler/editar dados da Clínica B. O scanner Wiz/Supabase apontou exatamente isso.

## Objetivo

Isolar 100% dos dados por `account_owner_id` (o dono da conta = clínica), sem quebrar o app em produção.

## Tabelas afetadas (faltam `account_owner_id` ou RLS por tenant)

Críticas (PII / financeiro / operação):
- `business_settings`
- `user_roles`
- `professional_whatsapp_credentials`
- `professional_credentials`
- `appointments`
- `professionals` (tem `user_id`, falta `account_owner_id` direto)

Já isoladas indiretamente (confirmar via auditoria):
- `clients`, `services`, `service_packages`, `products`, `financial_entries`, `cash_*`, `client_documents`, etc.

## Estratégia (segura, sem downtime)

Executar em **3 migrações**, cada uma idempotente e reversível:

### Migração 1 — Backfill estrutural
1. `ALTER TABLE ... ADD COLUMN account_owner_id uuid` nas 6 tabelas críticas (nullable inicialmente).
2. Função helper `public.get_account_owner_for_user(uuid)` (SECURITY DEFINER) que resolve `account_owner_id` a partir de `profiles.account_owner_id` (fallback = próprio id).
3. Backfill:
   - `business_settings.account_owner_id` = `user_id` resolvido via profiles
   - `user_roles.account_owner_id` = idem
   - `professional_whatsapp_credentials.account_owner_id` = via `professionals.user_id → profiles`
   - `professional_credentials.account_owner_id` = idem
   - `appointments.account_owner_id` = via `professionals.user_id → profiles`
   - `professionals.account_owner_id` = via `user_id → profiles`
4. Trigger `BEFORE INSERT` em cada tabela: se `account_owner_id IS NULL`, preencher automaticamente a partir de `auth.uid()` via `get_account_owner_for_user()`.

### Migração 2 — Tornar `NOT NULL` + RLS por tenant
1. `ALTER COLUMN account_owner_id SET NOT NULL` (após verificar 0 nulls).
2. Função helper `public.current_account_owner_id()` (SECURITY DEFINER, STABLE) — retorna o `account_owner_id` do `auth.uid()` corrente.
3. Reescrever **todas as policies** das 6 tabelas para combinar `has_role(...)` **+** `account_owner_id = current_account_owner_id()`.
4. Index em `account_owner_id` em todas as 6 tabelas.

### Migração 3 — Realtime + edge functions
1. Confirmar publicação Realtime já filtra por RLS (automático no Supabase) — apenas testar.
2. Auditar edge functions (`admin-create-professional`, `whatsapp-claim-pool-instance`, `admin-set-user-permissions`, `admin-toggle-user-active`, `admin-delete-user`, `complete-signup`, `whatsapp-connect`) para sempre escopar queries por `account_owner_id` do caller, e nunca confiar em `professional_id` recebido do client sem validar tenant.

## Marcação das findings

Após cada migração executada e validada, marcar como `mark_as_fixed` as findings correspondentes no scanner.

## Riscos & mitigação

- **Risco:** backfill incorreto deixa linhas órfãs → mitigação: query de verificação no fim da Migração 1 que aborta se houver `NULL`.
- **Risco:** policies novas bloqueiam super-admin → mitigação: super-admin (`is_super_admin()` via allowlist) bypass em todas as policies.
- **Risco:** edge functions com `service_role` quebram → mitigação: revisão manual + teste após Migração 2.

## Entrega

Vou começar pela **Migração 1** (estrutural + backfill + trigger de autopreenchimento). Você revisa, aprova, e seguimos para a 2 e 3.

Confirma para eu disparar a Migração 1?