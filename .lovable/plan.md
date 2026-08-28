# Criar os planos Hora Pro no Asaas (24 links de assinatura)

Objetivo: replicar no Asaas exatamente a tabela de planos do app (8 pacotes de
usuários × 3 ciclos), aceitando cartão de crédito, cartão de débito, Pix e
boleto nos links. O cadastro dentro do app continua exigindo cartão de crédito
(cobrança automática + teste de 20 dias) — isso não muda.

## O que será criado no Asaas

24 links de pagamento de assinatura, um para cada combinação:

| Usuários | Mensal | Semestral (−10%) | Anual (−20%) |
|---|---|---|---|
| 1 | R$ 79,90 | R$ 431,46 | R$ 767,04 |
| 5 | R$ 250,00 | R$ 1.350,00 | R$ 2.400,00 |
| 8 | R$ 400,00 | R$ 2.160,00 | R$ 3.840,00 |
| 10 | R$ 500,00 | R$ 2.700,00 | R$ 4.800,00 |
| 15 | R$ 750,00 | R$ 4.050,00 | R$ 7.200,00 |
| 20 | R$ 1.000,00 | R$ 5.400,00 | R$ 9.600,00 |
| 25 | R$ 1.250,00 | R$ 6.750,00 | R$ 12.000,00 |
| 30 | R$ 1.500,00 | R$ 8.100,00 | R$ 14.400,00 |

Cada link nasce com:
- Nome: `Hora Pro — N usuário(s) · Mensal|Semestral|Anual`
- Formas de pagamento livres (o cliente escolhe cartão de crédito, débito, Pix
  ou boleto na tela do Asaas)
- Cobrança recorrente no ciclo correspondente (MONTHLY / SEMIANNUALLY / YEARLY)
- Notificações do Asaas ativas e prazo de vencimento de 5 dias para boleto/Pix

Observação importante: em assinatura recorrente automática o Asaas só renova
sozinho com **cartão de crédito**. Em Pix e boleto o Asaas gera a fatura de cada
ciclo e envia ao cliente, que precisa pagar — o app libera/suspende o acesso
conforme o webhook confirma ou atrasa o pagamento. Cartão de débito é aceito no
link, mas apenas como pagamento avulso do ciclo.

## Como será feito (técnico)

1. **Tabela `billing_payment_links`** (migration): `seats`, `billing_months`,
   `cycle_key`, `total_cents`, `asaas_payment_link_id`, `url`, `active`,
   timestamps. Índice único em (`seats`, `billing_months`). Leitura liberada para
   usuários autenticados; escrita apenas pelo service role (edge function).
2. **Edge function `asaas-sync-payment-links`** (só super admin): percorre
   `BILLING_PLANS × BILLING_CYCLES`, calcula o valor com `quoteCycle` (a fonte
   única da verdade já existente em `_shared/billingPlans.ts`) e:
   - procura no Asaas (`GET /paymentLinks`) um link já criado com o mesmo
     `externalReference` (`plan:seats:<n>|months:<m>`);
   - cria (`POST /paymentLinks`) se não existir; atualiza (`PUT`) valor, nome,
     ciclo e formas de pagamento se existir — idempotente, sem duplicar links a
     cada execução;
   - grava/atualiza a linha em `billing_payment_links`.
3. **Painel do super admin** (`src/pages/AdminPanel.tsx`): aba "Planos no Asaas"
   com botão "Sincronizar planos", tabela dos 24 planos (usuários, ciclo, valor,
   status) e botão de copiar/abrir o link de cada um.
4. **Testes de regressão** (`src/lib/__tests__/`): os 24 pares gerados batem com
   `BILLING_PLANS`/`BILLING_CYCLES`, os valores conferem com `quoteCycle`, o
   `externalReference` é estável e a sincronização repetida reaproveita o link
   existente em vez de criar outro.

Nada no fluxo de cadastro, teste de 20 dias, carência de 2 dias ou webhook é
alterado.
