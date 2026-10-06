# Revisão completa: Produtos, Caixa, Financeiro e Agenda

## O que já confirmei
- As 4 compras de hoje com "Produto já pago" não tiraram dinheiro do caixa diretamente.
- Mas cada uma gerou uma **saída "paga" no Financeiro** (R$ 45, R$ 260, R$ 45, R$ 140). As telas do Caixa e do Financeiro somam essa saída, por isso o valor aparece como se o dinheiro tivesse saído agora.

## Correção 1 — "Produto já pago"
- A compra marcada como já paga entra só no estoque e no histórico de compras da página Produtos.
- Não gera saída no Financeiro nem no Caixa.
- Apago as 4 saídas de hoje (e outras antigas iguais). Compras e estoque não mudam.
- Teste automático que falha se essa saída voltar.

## Correção 2 — Revisão de todo o fluxo
Para cada item, confiro no banco os registros reais e no código como é gravado e somado:
1. **Venda de produto para cliente** (Caixa): entrada no caixa, Financeiro, baixa no estoque, perfil do cliente.
2. **Serviço avulso, kit, pacote comum e pacote sequencial** (Agenda e Caixa): valor, desconto, taxa de cartão, parcelas, situação (pago, parcial, pendente), comissão.
3. **Boleto parcelado**: cada parcela criada com valor e vencimento certos; só a parcela com baixa entra como recebida; atraso, cancelamento e exclusão.
4. **Contas a pagar e a receber** (Financeiro): baixa com data informada, conta e caixa certos, sem duplicar.
5. **Compra de produto sem "já pago"**: uma única saída, no caixa aberto certo.
6. **Totais**: Caixa (barra ao vivo, fechamento), Financeiro (extrato, relatório consolidado) e Agenda mostrando o mesmo valor; caixa do profissional independente separado do caixa do estabelecimento.
7. **Registros duplicados ou órfãos** (venda sem lançamento, lançamento sem venda, saída sem caixa).

Cada erro encontrado é corrigido na hora, com teste que falha se a correção for desfeita. Dados errados já gravados são corrigidos sem apagar vendas ou pagamentos legítimos; antes de qualquer ajuste maior em dados antigos, eu peço sua autorização.

No final, você recebe uma lista: o que estava certo, o que estava errado e foi corrigido, e o que eu não consegui conferir dentro do app.

## Detalhes técnicos
- `sync_product_purchase_finance`: quando `skip_cash_transaction = true`, não inserir `financial_entries`; remover `financial_entries` com `source_type` de compra cujas compras têm `skip = true`.
- Atualizar `product-purchase-already-paid.test.ts`.
- Auditoria via `read_query`: `single_sales`, `cash_transactions`, `financial_entries`, `boleto_installments`, `appointments`, `commissions`, `product_purchases`; código em `SaleForm.tsx`, `useSingleSales.ts`, `useBoletoInstallments.ts`, `useFinancialEntries.ts`, `ExtratoFinanceiro.tsx`, `RelatorioConsolidado.tsx`, `CashRegisterPanel.tsx`, `useLiveCashTotals.ts`, `process-payment`.
- Rodar vitest e tsgo ao final.
