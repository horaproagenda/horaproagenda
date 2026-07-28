## Diagnóstico (confirmado no banco)

Os agendamentos novos nascem corretamente como `pending` (default da coluna `payment_status` é `'pending'`), mas são marcados como pagos logo depois por rotinas automáticas:

1. **`sync_appointments_with_paid_sale`** (função no banco): no ramo `item_type = 'service'` ela faz um UPDATE em massa marcando `payment_status = 'paid'` em **todos** os agendamentos do cliente com aquele serviço, sem limite de quantidade, a partir de `sale_date - 1 dia`. Uma venda de 1 aplicação marca a série inteira como paga.
   - Evidência: 9 agendamentos "Sessão 1..9 de 9" criados hoje ficaram `paid` com `amount_paid = 140` e `payment_methods` vazio — criados pelo fluxo de recorrência, que não envia nenhum dado de pagamento.
2. **`trg_single_sales_sync_payment`** dispara essa função a cada venda paga, e **`repair_payment_integrity`** roda a mesma função para *todas* as vendas pagas históricas — e ela é chamada automaticamente pelo app em `src/hooks/usePaymentIntegrityAutoCheck.ts` ao abrir o sistema. Ou seja, mesmo agendamentos futuros novos são "consertados" para pago.
3. **`supabase/functions/create-appointment/index.ts`** (linha ~600): quando qualquer campo de pagamento é enviado, assume `payment_status = amount > 0 ? 'paid' : 'pending'`, sem considerar desconto, valor parcial ou crédito do cliente.
4. **`src/hooks/useClientServices.ts` (`markServiceAsUsed`)** grava `payment_status: 'paid'` com `payment_methods` vazio, apagando a rastreabilidade da forma de pagamento original da venda.

## Correções propostas

### Banco de dados (migração)
- Reescrever `sync_appointments_with_paid_sale`:
  - Ramo **serviço**: só marcar como pago o agendamento efetivamente vinculado à venda (via `client_services.appointment_id` / `sale_id`), respeitando a quantidade vendida. Sem vínculo, não altera nada.
  - Ramo **pacote**: manter apenas as sessões do pacote da venda, mas calcular status de forma correta (`paid` só se o valor recebido cobrir o total; senão `partial`), em vez de forçar `paid`.
  - Propagar `payment_methods` da venda para o agendamento, para manter forma de pagamento, desconto e crédito rastreáveis.
- Ajustar `repair_payment_integrity` para nunca criar pagamento onde não existe evidência (venda vinculada, `client_services` consumido, parcela de boleto quitada ou lançamento financeiro pago).
- Adicionar função `backfill_reset_unbacked_paid_appointments()` que devolve para `pending` os agendamentos hoje marcados como pagos **sem nenhuma evidência de pagamento** (sem `payment_methods`, sem venda vinculada, sem `client_services` consumido, sem lançamento financeiro), preservando os legítimos. Executada uma vez na migração, com relatório de quantas linhas foram corrigidas.

### Edge function `create-appointment`
- Derivar o status a partir do valor efetivamente recebido versus o valor devido (preço − desconto): `paid` só quando cobre o total, `partial` quando parcial, `pending` quando zero. Nunca inferir `paid` só porque `amount_paid > 0`.

### Frontend
- `src/hooks/usePaymentIntegrityAutoCheck.ts`: parar de rodar o reparo global automaticamente; manter apenas a auditoria (leitura) e disparar o reparo somente para inconsistências reais com evidência de pagamento.
- `src/hooks/useClientServices.ts`: ao consumir uma aplicação paga, copiar `payment_methods`, desconto e data de pagamento da venda de origem em vez de gravar `paid` "seco".
- `src/components/appointments/NewAppointmentDialog.tsx`: manter `paid` apenas quando há consumo comprovado de pacote/serviço já pago; nos demais caminhos enviar `pending`.

### Testes
- Testes unitários para a regra de derivação de status (pago/parcial/pendente com desconto e crédito do cliente).
- Verificação por consulta no banco após a migração: nenhuma série recorrente nova deve ficar `paid` sem venda vinculada.

## Observação
O backfill altera dados existentes. Ele só reverte registros sem qualquer evidência de pagamento; se preferir revisar a lista antes de aplicar, posso rodar primeiro em modo relatório.
