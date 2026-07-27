## Diagnóstico (confirmado nos dados)

Ao cadastrar um serviço no "Histórico antigo" com pagamento, o app grava **três registros** para o mesmo pagamento:

Exemplo real do cliente Arthur (18/02, R$ 110), gravados no mesmo segundo:
- `appointments` → `amount_paid = 110`, notas `[Histórico] Cadastro retroativo`
- `financial_entries` → recebível pago de R$ 110
- `single_sales` → venda de R$ 110 com `paid_at` preenchido

No perfil do cliente, o "Histórico de Pagamentos" (`useClientProfile`) monta a lista a partir de **duas fontes**: as vendas (`single_sales`) e os agendamentos pagos. Normalmente um agendamento é "escondido" quando existe uma venda paga do mesmo serviço, mas há um bypass explícito para lançamentos retroativos (`notes` começando com `[Histórico]`). Como o próprio diálogo passou a criar também a venda, o bypass deixou de fazer sentido: o mesmo pagamento aparece uma vez como venda e outra como agendamento → **linha duplicada**.

Como o valor aparece duas vezes no histórico, o abatimento do crédito também aparece dobrado na leitura do cliente (o débito real em `client_credit_transactions` é único por cadastro — confirmado: 1100 → 990 → 880 para dois cadastros de R$ 110).

## Correção

1. **`src/hooks/useClientProfile.ts`**
   - Ajustar o bypass `isRetroactiveLegacy`: um agendamento retroativo só entra no histórico quando **não existir** venda retroativa correspondente (mesmo cliente, mesmo `service_id`/pacote, mesma data de pagamento e mesmo valor). A venda passa a ser a fonte única da verdade.
   - Manter o bypass apenas para registros antigos (legado) que não possuem venda associada, para não sumir com pagamentos já cadastrados antes desta correção.

2. **`src/components/client-profile/LegacyHistoryDialog.tsx`**
   - Vincular a venda retroativa ao agendamento criado (gravar `appointment_id`/referência quando a coluna existir) para que a deduplicação seja determinística e não dependa de heurística de data/valor.
   - Garantir que o débito de crédito ao cliente aconteça **uma única vez** por cadastro (guarda contra duplo submit: desabilitar o botão enquanto `submitting` e checar transação já existente para o mesmo `appointment_id` antes de inserir em `client_credit_transactions`).

3. **Teste de regressão**
   - Novo teste unitário para a função de montagem de `paymentHistory`, cobrindo: (a) cadastro retroativo com venda → 1 linha; (b) cadastro retroativo legado sem venda → 1 linha; (c) venda normal com agendamento pago → 1 linha; (d) boleto parcelado → uma linha por parcela paga.

## Detalhes técnicos

- Dedup key proposta: `sale.appointment_id` quando disponível; fallback `${service_id||package_id}|${data_pagamento}|${valor}`.
- Nenhuma migração de dados é necessária — a duplicação é apenas de exibição; os registros existentes (`financial_entries` + `single_sales`) permanecem íntegros para o Financeiro e o Caixa.
- Se a tabela `single_sales` não tiver coluna de vínculo com agendamento, será adicionada por migração (`appointment_id uuid`, nullable, com índice), mantendo os GRANTs e políticas atuais.
