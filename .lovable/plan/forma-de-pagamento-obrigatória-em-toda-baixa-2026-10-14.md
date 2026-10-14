# Forma de pagamento obrigatória em toda baixa

## Objetivo
Nenhum recebimento pode ser marcado como pago sem forma de pagamento — seja na agenda, no caixa, em pacotes, contas a receber, boletos ou vendas avulsas.

## Etapas
1. **Levantamento**: conferir cada caminho de baixa (diálogo de pagamento da agenda, novo agendamento já pago, venda no caixa, venda avulsa, pacotes/serviços do cliente, contas a receber, parcelas de boleto) e anotar quais já exigem a forma e quais não.
2. **Trava nas telas**: onde faltar, o botão de confirmar fica desativado até escolher a forma, com aviso claro ("Escolha a forma de pagamento").
3. **Trava no banco** (garantia final): regra que recusa lançamento financeiro de entrada com status pago sem forma de pagamento, com mensagem amigável. Registros antigos não são alterados.
4. **Relatório dos antigos**: contar lançamentos pagos já existentes sem forma e informar o número, sem mexer neles (correção só com sua autorização).
5. **Testes**: um teste por regra (sem forma → bloqueado; com forma → permitido) e verificação no banco.

## Detalhes técnicos
- Helper puro `requirePaymentMethod` em `src/lib/` usado pelos formulários; testes em `src/lib/__tests__`.
- Trigger BEFORE INSERT/UPDATE em `financial_entries` (e `cash_transactions` se aplicável): se tipo receita e status pago e `payment_method`/`payment_method_id` nulos → exceção traduzida por `humanizeError`. Lançamentos placeholder de venda (não pagos) continuam permitidos.
- Caminhos a revisar: `useAppointmentPaymentHandler`, `NewAppointmentDialog`, `SaleForm`, `useSingleSales`, `useClientServices`, `ContasAReceber`, `useBoletoInstallments`, RPCs que marcam pagamento.
