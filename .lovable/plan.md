# Corrigir a edição da quantidade de uma compra

## O que encontrei
- A compra de **Luva descartável** foi salva com **600 unidades**, às 16h36. A correção chegou a ser gravada na compra.
- Mas o **estoque do produto continua em 6**. Ao editar uma compra, o sistema muda só a linha da compra e não ajusta o estoque. Por isso parece que nada mudou.
- Também não aparece uma confirmação clara. O botão fica carregando enquanto o sistema também atualiza as datas de uso do produto, e a lista não é recarregada.
- **Outro erro:** o preço por unidade ficou R$ 13,00. Com 600 unidades, o total da compra passou a ser **R$ 7.800,00**. Se você pagou R$ 78,00 pelas 600 unidades, o preço por unidade é R$ 0,13. Hoje a tela recalcula o total sozinha e não avisa.
- **Outro erro:** se a compra não for "Produto já pago", mudar a quantidade também muda a saída no Financeiro e no Caixa, sem nenhum aviso.

## O que muda
1. Editar a quantidade de uma compra ajusta o estoque pela diferença. Exemplo: de 6 para 600, o estoque sobe 594. Compra e estoque são salvos juntos: ou os dois mudam, ou nenhum muda.
2. O estoque nunca fica negativo. Se a nova quantidade for menor do que o que já foi usado, aparece um aviso claro e nada é salvo.
3. Ao mudar a quantidade, a tela pergunta qual valor manter: o **total pago** ou o **preço por unidade**. Ela mostra o total antes de salvar.
4. Depois de salvar, a lista, o estoque e o Financeiro atualizam na hora. Aparece "Compra atualizada: estoque agora X". O botão para de carregar mesmo se der erro, e o erro aparece com o motivo.
5. Excluir uma compra também tira as unidades do estoque e apaga a saída dela no Financeiro e no Caixa.
6. **Sua compra de luvas:** ajusto o estoque para 600 (mais o que já tiver sido usado, se houver). Depois você me diz o total certo pago, e eu corrijo os R$ 7.800,00.

## Detalhes técnicos
- Nova RPC `update_product_purchase(_id, ...)` SECURITY DEFINER com a mesma checagem de acesso de `register_product_purchase`:
  - trava a linha do produto;
  - calcula `delta = new_qty - old_qty` na unidade do produto (usa `convert_product_quantity` se a unidade da compra for diferente);
  - recusa a mudança se `current_stock + delta < 0` (P0001 com mensagem em português);
  - atualiza `product_purchases` e `products.current_stock` na mesma transação;
  - o trigger `sync_product_purchase_finance` refaz a parte do Financeiro e do Caixa.
- `delete_product_purchase` RPC: remove o estoque e limpa `financial_entries` e `cash_transactions` com essa referência.
- `useProducts.ts`: `updatePurchase` e `deletePurchase` passam a chamar as RPCs e invalidam `products`, `product_purchases`, `financial_entries` e `cash_transactions`. Usam `@/lib/toast`.
- `ProductDetailDialog.tsx`: trocar entre manter o total ou o preço unitário; `try/finally` no salvar; mensagem com o novo estoque.
- Ajuste de dados: estoque da Luva descartável = 6 + 594.
- Teste de regressão: a migração ajusta o estoque pela diferença, e o hook não faz mais `.from('product_purchases').update`. Rodar vitest e tsgo.
