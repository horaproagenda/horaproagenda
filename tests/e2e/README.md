# Testes E2E — Fluxo de Assinatura

## `subscription_flow.py`

Cobre o ciclo completo: cadastro → bloqueio → aprovação → liberação da agenda.

### Etapas testadas

| # | Etapa | Verificação |
|---|-------|-------------|
| 1 | Signup + login | Redireciona para `/assinatura` |
| 2 | Tentar `/agenda` | Redireciona de volta para `/assinatura` |
| 3 | Página `/assinatura/status` | Mostra badge **Pendente** |
| 4 | Ativar assinatura (simulação do webhook) | `status=active` no banco |
| 5 | Realtime | UI atualiza para **Ativa** sem reload |
| 6 | Acessar `/agenda` | Página carrega normalmente |

### Como rodar

```bash
export APP_URL="http://localhost:8080"
export SUPABASE_URL="https://<ref>.supabase.co"
export SUPABASE_ANON_KEY="eyJ..."          # anon key
export SUPABASE_SERVICE_ROLE_KEY="eyJ..."  # service role (necessário só para simular o webhook)

python3 tests/e2e/subscription_flow.py
```

Screenshots ficam em `/tmp/browser/subscription-flow/`.

---

## Teste manual com Stripe real (modo teste)

O script acima simula o webhook via `UPDATE` direto para ser determinístico.
Para validar de ponta a ponta com Stripe real:

1. **Configurar Stripe no modo Test** e obter `STRIPE_SECRET_KEY` (`sk_test_...`)
   e o webhook signing secret (`whsec_...`). Salvar via `add_secret`.
2. **Registrar o webhook** em https://dashboard.stripe.com/test/webhooks
   apontando para `https://<ref>.functions.supabase.co/stripe-webhook`
   com os eventos:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
3. **Cadastro real:** criar conta em `/auth`, confirmar e-mail.
4. Ao entrar, será redirecionado para `/assinatura`.
5. Escolher um plano → **Assinar** → checkout abre em nova aba.
6. Usar o cartão de teste `4242 4242 4242 4242`, qualquer CVC futuro e CEP.
7. Após aprovação, o Stripe dispara `checkout.session.completed` +
   `customer.subscription.created`. O webhook grava `status='active'` em
   `account_subscriptions`, e a UI recebe via realtime — o usuário passa a
   acessar `/agenda` sem reload.
8. Em `/assinatura/status`, clicar em **Ver faturas e recibos** abre o
   portal Stripe (customer portal) com o histórico completo.

### Cenários de erro para validar

| Cartão de teste | Comportamento esperado |
|-----------------|-----------------------|
| `4000 0000 0000 0002` | Pagamento recusado → permanece `trial`, `/agenda` bloqueada |
| `4000 0000 0000 9995` | Insufficient funds → idem |
| `4000 0025 0000 3155` | Requires 3DS → completar autenticação → libera |
