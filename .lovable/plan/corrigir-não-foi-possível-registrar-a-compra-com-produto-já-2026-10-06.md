# Corrigir "Não foi possível registrar a compra" com "Produto já pago"

## Causa encontrada
1. **Forma de pagamento obrigatória escondida:** o banco recusa qualquer compra sem forma de pagamento. Com "Produto já pago", a pessoa costuma deixar "Não informada", e a compra é recusada.
2. **A mensagem certa não aparece:** o motivo real ("a forma de pagamento é obrigatória") vira a mensagem genérica de falha.

## Outros erros encontrados no mesmo fluxo
3. **"Produto já pago" é ignorado:** mesmo marcado, uma automação do banco lança a saída no Financeiro e no Caixa.
4. **Saída em dobro:** com "já pago" desmarcado, a compra gera duas saídas no caixa: uma da rotina da compra e outra da automação.
5. **Saída sem caixa:** quando o caixa não está aberto, a automação grava uma saída sem caixa definido.

## O que muda
- **Com "Produto já pago" marcado:**
  - a forma de pagamento passa a ser opcional;
  - não sai nada do Caixa;
  - fica no Financeiro só um registro "pago", sem tirar dinheiro do caixa, para manter o histórico.
- **Sem "já pago":**
  - o formulário pede a forma de pagamento antes de enviar, com aviso claro;
  - a compra gera uma única saída no Caixa e no Financeiro, sempre com o valor certo;
  - o lançamento vai para o caixa aberto do profissional ou da conta;
  - quando não houver caixa aberto, a saída fica só no Financeiro.
- Os motivos de recusa aparecem com texto claro, por exemplo "Informe a forma de pagamento" ou "Sem permissão".
- Vou conferir as compras já registradas e apagar as saídas em dobro ou sem caixa definido. Nenhuma compra e nenhum estoque serão alterados.

## Detalhes técnicos
- Coluna `product_purchases.skip_cash_transaction boolean default false`, gravada pela RPC `register_product_purchase`.
- `require_product_purchase_payment_method`: só exige a forma quando `skip_cash_transaction = false`.
- `sync_product_purchase_finance` passa a ser a única fonte da saída:
  - se `skip`: só `financial_entries` (pago, sem caixa);
  - senão: um `cash_transactions` com `cash_register_id` obrigatório (resolve_financial_destination → caixa aberto) e sinal de valor igual às demais despesas;
  - a RPC deixa de inserir `cash_transactions` diretamente.
- Correção de dados: remover `cash_transactions` duplicados ou com `cash_register_id` nulo de `reference_type='product_purchase'`.
- Validação no `Produtos.tsx`: forma obrigatória quando não for "já pago". `humanError` passa a manter mensagens P0001/23514 em português.
- Teste de regressão: "já pago" sem forma é aceito e não gera saída no caixa; sem "já pago" gera exatamente uma saída. Rodar vitest e tsgo.
