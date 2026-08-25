# Log de versões

Registro de cada publicação. A versão estável mais recente é o ponto de
rollback. Não descartar a anterior antes da validação em produção.

Modelo de entrada:

```text
## AAAA-MM-DD — <resumo>
Estável anterior:
Problema corrigido:
Arquivos alterados:
Migrations:
Testes executados:
Publicado por:
Validação em produção:
Rollback (se aplicado):
```

---

## 2026-08-22 — Guardas anti-regressão (candidata a versão estável)

- **Estável anterior:** versão publicada antes desta data no histórico do
  Lovable (mobile hardening) — manter disponível para rollback.
- **Problema corrigido:** correções validadas voltavam a quebrar após novas
  alterações; `h-screen`/`min-h-screen` ainda usavam `100vh` puro (regressão de
  layout no iPhone).
- **Arquivos alterados:** `src/index.css`, `package.json`, novos testes de
  regressão em `src/__tests__/regression/`, `src/lib/__tests__/`,
  `tests/smoke/`, documentação em `docs/`.
- **Migrations:** nenhuma.
- **Testes executados:** `vitest run` → 502/502 verdes;
  `rls-anon-lockdown.smoke` → 37/37 verdes; build de produção verde.
- **Publicado por:** —
- **Validação em produção:** — (preencher após publicar: login, agenda,
  financeiro, documento)
- **Rollback:** não aplicado.

## 2026-08-25 — Cobrança Asaas: plano+cartão no cadastro, trial 20 dias, carência 2 dias

- Cadastro de conta fica pendente até escolher plano e cadastrar cartão; trial de 20 dias inicia só com cartão salvo (asaas-create-subscription).
- Tabela fixa de planos (1-30 usuários) em supabase/functions/_shared/billingPlans.ts espelhada em src/lib/plans.ts; ciclos mensal/semestral(-10%)/anual(-20%).
- Webhook asaas-webhook idempotente (payment_webhook_events) com trilha em payments, e-mails transacionais e notificações in-app (notifications + Realtime).
- Falha de cobrança: e-mail ao admin + banner de carência (2 dias); sem regularização, suspend_overdue_subscriptions marca suspended; ações de pagamento só para admin (PaymentGraceBanner/PaymentFailedGate).
- asaas-update-card troca o cartão e retenta a fatura na hora; confirmação de pagamento reativa o acesso automaticamente.
