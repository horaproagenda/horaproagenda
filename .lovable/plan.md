## Objetivo

Criar uma suíte de **testes automatizados de fumaça** (smoke tests) que valide os fluxos críticos do app antes da publicação, sem depender de testes manuais repetitivos.

## Escopo dos testes

1. **Pagamento de comissão do profissional**
   - Criar agendamento → marcar pago → verificar comissão calculada (% / fixo / por serviço)
   - Marcar comissão como paga → verificar que sai da lista de pendentes e gera entrada financeira

2. **Agendamento de pacotes (comum e sequencial)**
   - Criar pacote standard: usar 1 sessão → saldo decrementa → bloqueio ao exceder
   - Criar pacote sequential: validar `interval_after_days` entre etapas, ordem obrigatória
   - Cancelar pacote: idempotência + soft-cancel + devolução de saldo

3. **Pagamentos e devolução de valor**
   - Pagamento em dinheiro/PIX → entra no caixa (`affects_cash=true`) + cria `financial_entry`
   - Pagamento crédito ao cliente → NÃO afeta caixa, gera saldo
   - Devolução: cancelar venda paga → reverter caixa + financeiro
   - Troco: validar entrada negativa em `cash_register_entries`

4. **Estoque e uso de produtos**
   - Criar serviço com produtos vinculados (`service_products.quantity_per_use`)
   - Concluir agendamento (`status='completed'`) → trigger `decrease_product_stock_on_appointment_complete` reduz estoque
   - Validar custo unificado por aplicação (precificação + devolução em pacote)

5. **Realtime (sincronização entre abas/dispositivos)**
   - Abrir 2 conexões Supabase no mesmo teste
   - Conexão A insere/edita/cancela agendamento
   - Conexão B recebe evento via `postgres_changes` em < 3s

## Estrutura técnica

```text
tests/
├── smoke/
│   ├── setup.ts              # cliente Supabase de teste, helpers de fixtures
│   ├── fixtures.ts           # cria/destrói cliente, profissional, serviço, produto temp
│   ├── commission.smoke.test.ts
│   ├── packages.smoke.test.ts
│   ├── payments.smoke.test.ts
│   ├── inventory.smoke.test.ts
│   └── realtime.smoke.test.ts
└── README.md                 # como rodar
```

- **Framework**: Vitest (já compatível com a stack) + `@supabase/supabase-js` direto contra o Supabase do projeto, usando o **anon key** + login de um usuário de teste.
- **Isolamento**: cada teste cria entidades com sufixo `__smoke_<timestamp>` e limpa no `afterAll`.
- **Realtime**: usa `supabase.channel(...).on('postgres_changes', ...)` com `Promise` aguardando o evento.
- **Credenciais**: usuário de teste lido de `VITE_TEST_EMAIL` / `VITE_TEST_PASSWORD` (variáveis locais; não comitar). Fallback: pular testes com `it.skip` se ausentes, com mensagem clara.

## Como será executado

- Comando: `bunx vitest run tests/smoke` (ou via tool `lovable-exec test`)
- Saída: relatório por fluxo (✅/❌) com tempo de cada operação
- Ideal rodar antes de publicar; pode ser rodado pelo agente sob demanda

## Arquivos a criar

1. `tests/smoke/setup.ts`
2. `tests/smoke/fixtures.ts`
3. `tests/smoke/commission.smoke.test.ts`
4. `tests/smoke/packages.smoke.test.ts`
5. `tests/smoke/payments.smoke.test.ts`
6. `tests/smoke/inventory.smoke.test.ts`
7. `tests/smoke/realtime.smoke.test.ts`
8. `tests/smoke/README.md`
9. `vitest.smoke.config.ts` (config separada com timeout maior, sem jsdom)

## Premissas / Pontos a confirmar

- **Usuário de teste**: preciso que você crie/forneça um e-mail+senha de um profissional admin no app só para os testes (não usar a conta principal). Vou ler de variáveis locais; se não existir, os testes ficam em `skip` com instruções.
- Os testes operam contra o **banco real** (não há staging). Tudo que é criado é deletado no fim, mas há risco residual mínimo. Confirma essa abordagem?

## Fora de escopo

- Testes E2E de UI (clicar em botões reais com Playwright) — mais lentos e frágeis. A camada de fumaça via API cobre as regras de negócio que importam para publicação.
- CI/CD automático — você roda manualmente quando quiser, ou me pede para rodar.