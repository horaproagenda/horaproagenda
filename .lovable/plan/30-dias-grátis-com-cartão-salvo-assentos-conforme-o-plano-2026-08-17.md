# 30 dias grátis com cartão salvo + assentos conforme o plano

## Objetivo
Todo novo cadastro passa a ter 30 dias de teste gratuito, desde que deixe um cartão (crédito/débito) salvo no checkout. No 31º dia o Stripe cobra automaticamente o plano escolhido. Durante o teste, a conta já libera a quantidade de usuários/profissionais do plano contratado.

## Situação atual (verificada)
- O checkout (`create-checkout`) cria a assinatura **sem** período de teste.
- Novas contas nascem com `account_subscriptions.status = 'trial'` e `trial_ends_at = now() - 1s` (ou seja, teste já expirado) e `seat_limit = 1` — herança da regra anterior "sem teste grátis".
- O webhook do Stripe já grava `seat_limit = quantidade de assentos` da assinatura, mas mapeia `trialing` como `active` (perde a informação de teste e a data de término).
- O limite de usuários já é aplicado no banco (trigger de assentos) e exposto por `get_seat_usage` / `useSeatUsage`.
- Já existe verificação de elegibilidade (`check_trial_eligibility`) que bloqueia reuso de teste por e-mail/CPF/CNPJ/telefone e contas excluídas recentemente.

## O que será feito

### 1. Checkout com 30 dias grátis e cartão obrigatório
- `create-checkout`: quando a conta for elegível ao teste, criar a sessão com 30 dias de teste, exigindo método de pagamento salvo e cancelamento automático caso o cartão falte no fim do teste.
- Elegibilidade decidida no servidor (nunca no cliente): só recebe teste quem nunca usou teste/pagou nesta conta e não está em bloqueio de exclusão recente. Reassinaturas e upgrades entram sem teste.
- Pix/boleto (pagamento antecipado) continua sem teste — não permite cobrança automática; a interface deixará isso explícito.

### 2. Estado de teste refletido no app
- Webhook (`stripe-webhook`) e `check-subscription`: assinatura `trialing` passa a gravar `status = 'trial'` com `trial_ends_at` = fim do teste do Stripe, mantendo `seat_limit` = assentos comprados.
- Acesso liberado normalmente durante o teste (a lógica de `hasAccess` já contempla trial válido).
- Banner e página de assinatura mostram "Teste grátis — X dias restantes; cobrança automática em DD/MM" com atalho para trocar o cartão no portal do Stripe.

### 3. Assentos conforme o plano escolhido
- Contas novas deixam de nascer travadas em 1 assento com teste expirado: o `seat_limit` passa a vir do plano contratado no checkout (inclusive durante o teste).
- Tela de usuários da conta e o diálogo de novo profissional mostram "usados / disponíveis" e, ao atingir o limite, mensagem clara com botão para aumentar o plano.
- Mensagem do banco ao estourar o limite continua sendo traduzida pelo tratamento humanizado de erros.

### 4. Avisos automáticos
- Aviso por e-mail/toast quando o teste estiver perto do fim (evento de "trial_will_end" do Stripe) e quando a primeira cobrança for confirmada ou falhar (já existe fluxo de `past_due`, apenas ajustaremos os textos para o cenário de fim de teste).

## Detalhes técnicos
- `supabase/functions/create-checkout/index.ts`: `subscription_data.trial_period_days: 30`, `trial_settings.end_behavior.missing_payment_method: 'cancel'`, `payment_method_collection: 'always'`; nova checagem de elegibilidade via service role (`trial_registrations`, `deleted_account_blocklist`, `account_subscriptions`).
- `supabase/functions/stripe-webhook/index.ts` e `check-subscription/index.ts`: mapear `sub.status === 'trialing'` → `status: 'trial'`, `trial_ends_at: sub.trial_end`; manter `seat_limit`/`plan_tier` = `item.quantity`.
- Migração: ajustar `handle_new_account_signup` / `handle_new_user_subscription` para não marcar o teste como expirado na criação (conta nasce pendente de escolha de plano, sem teste consumido), sem alterar contas existentes.
- Frontend: `TrialBanner.tsx`, `AssinaturaSection.tsx`, `AssinaturaStatus.tsx`, `UsuariosConta.tsx` + textos de limite de assentos; testes unitários em `src/hooks/__tests__/useAccountSubscription.test.ts` e `src/lib/seatUsage.ts` cobrindo trial ativo/expirado.
- Configuração necessária no Stripe: manter cartão habilitado como método de pagamento e o webhook assinando `customer.subscription.trial_will_end` (já tratado no código).
