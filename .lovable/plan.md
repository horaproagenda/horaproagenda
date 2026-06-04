# Plano: Trial 30 dias + Cobrança por usuários + Permissões granulares + Inativação

Vou implementar tudo isso em blocos. Como envolve pagamento real, banco e múltiplas telas, será entregue em etapas dentro deste mesmo fluxo.

## 1. Trial de 30 dias e plano da conta

- Nova tabela `account_subscriptions` (1 por dono/admin da conta):
  - `trial_ends_at` (now + 30 dias no cadastro)
  - `status`: `trial` | `active` | `past_due` | `canceled` | `grandfathered`
  - `plan_tier` (1, 3, 6, 10, 15, 20, 25, 30) e `seat_limit`
  - `stripe_customer_id`, `stripe_subscription_id`, `current_period_end`
  - `is_grandfathered` (true para todos os usuários **existentes hoje** → acesso ilimitado, sem trial e sem cobrança)
- Trigger no `auth.users` (signup): cria `account_subscriptions` com `status='trial'` e `trial_ends_at = now()+30d` para novos cadastros.
- Migration de seed: marca todas as contas existentes como `is_grandfathered=true, status='grandfathered'`.

## 2. Cobrança Stripe (8 planos)

- Habilitar Stripe (built-in) e criar 8 produtos/preços recorrentes mensais (BRL):
  - 1=R$59,90 · 3=R$129,90 · 6=R$259,80 · 10=R$433,30 · 15=R$649,50 · 20=R$866,00 · 25=R$1.082,50 · 30=R$1.299,00
- Edge functions:
  - `create-checkout` — cria sessão de assinatura para o plano escolhido
  - `check-subscription` — verifica status no Stripe e atualiza `account_subscriptions`
  - `customer-portal` — gerenciar/cancelar/upgrade
- Página `/assinatura` (já existe) reformulada:
  - Banner do trial com contagem regressiva ("Faltam X dias")
  - Cards dos 8 planos com destaque do plano necessário pelo nº atual de usuários ativos
  - Botão "Assinar" → checkout
  - Botão "Gerenciar assinatura" quando ativo
- Gate de acesso: se `status='trial'` e `trial_ends_at < now()` e não `grandfathered`/`active` → redireciona para `/assinatura` (somente admin pode pagar; demais usuários veem tela "conta pendente de pagamento, fale com o administrador").

## 3. Permissões granulares (página + ações)

- Novo enum `app_module`: `agenda`, `clientes`, `financeiro`, `caixa`, `produtos`, `servicos`, `cadastros`, `relatorios`, `documentos`, `lembretes`, `configuracoes`, `auditoria`, `assinatura`.
- Nova tabela `user_permissions(user_id, module, can_view, can_create, can_edit, can_delete)`.
- Função `has_permission(_user_id, _module, _action)` SECURITY DEFINER. Admin sempre retorna true.
- Hook `usePermissions()` no front + componente `<RequirePermission module action>` para gates de UI.
- `ProtectedRoute` aceita `module` opcional e bloqueia rotas sem `can_view`.

## 4. Admin cria usuários com permissões + limite de assentos

- Tela em `Configurações → Usuários da conta` (admin only):
  - Lista de usuários ativos/inativos
  - "Adicionar usuário": email, nome, senha inicial, matriz de permissões por módulo (view/create/edit/delete), toggle "deve trocar senha no 1º login"
  - Toggle "Ativo/Inativo"
  - Botão "Reenviar senha" / "Forçar troca"
- Edge function `admin-create-account-user`:
  - Valida que o caller é admin **e** que `users_ativos < seat_limit` (ou está em trial/grandfathered)
  - Cria auth user com `email_confirm: true`
  - Grava permissões e flag `must_change_password`
- "Mudar senha" (qualquer usuário): tela em Configurações → Conta → Alterar senha (`supabase.auth.updateUser({password})`).

## 5. Inativação com logout imediato (Realtime)

- Nova coluna `profiles.is_active boolean default true`.
- RLS: todas as policies passam a exigir `profiles.is_active = true` via função `is_account_active(auth.uid())` (SECURITY DEFINER). Usuário inativo deixa de ler/escrever qualquer dado.
- Hook `useActiveAccountGuard` no `AuthContext`:
  - Subscreve Realtime em `profiles` filtrando pelo próprio `id`
  - Se `is_active` virar `false` → `signOut()` + redirect `/conta-inativa`
- Página `/conta-inativa` informa que o acesso foi suspenso pelo administrador.
- Edge function `admin-deactivate-user` revoga sessões via `auth.admin.signOut(userId, 'global')` para garantir invalidação do refresh token.

## 6. Testes

- Smoke tests (vitest) cobrindo:
  - Criar conta → trial criado com 30 dias
  - Admin cria usuário extra; bloqueio quando excede `seat_limit`
  - `has_permission` retorna correto para admin/usuário comum
  - Inativar usuário: RLS bloqueia leitura subsequente
- Teste manual guiado (vou listar os passos no final).

## Detalhes técnicos relevantes

- A conta é identificada pelo `owner_user_id` (primeiro admin). Usuários criados pelo admin ficam vinculados via `profiles.account_owner_id`.
- Grandfathering: migração roda **uma vez** marcando todos os `auth.users` atuais. Novos signups daqui pra frente começam em trial.
- O número de assentos consumidos = `count(profiles where account_owner_id = X and is_active = true)`.
- Stripe price IDs ficam em uma constante `src/lib/plans.ts` após criação.

## Comunicação no app

- Toast/banner no primeiro login pós-cadastro: "Você tem 30 dias grátis para testar. Depois disso, escolha um plano conforme o número de usuários."
- Banner persistente em todas as páginas durante o trial mostrando dias restantes e link "Ver planos".

## O que NÃO vou fazer agora (a confirmar)

- Não vou cobrar proporcionalmente quando o admin trocar de plano no meio do mês — uso `proration_behavior=create_prorations` padrão do Stripe.
- Não vou implementar webhook do Stripe (uso polling via `check-subscription` no login e a cada minuto, conforme padrão Lovable).
- Permissões padrão para usuário novo = todas em `false` (admin precisa marcar). Posso mudar para "view em tudo" se preferir.

Posso prosseguir com a implementação completa?