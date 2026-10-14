# Pagamento do pacote de Ana Flávia que não aparecia

## O que os dados mostram
- O pagamento existe. No dia **26/09/2026** foram recebidos **R$ 3.800,00 no Cartão de Crédito**. O valor está lançado no financeiro (conta a receber paga) e no caixa, ligado à sessão de 19/08 do pacote "Corpo inteiro".
- O registro com data de **27/08/2026** não é um pagamento. É a **ficha de venda criada automaticamente** quando o pacote foi agendado, ainda sem data de pagamento e sem forma de pagamento.
- Quando a baixa foi feita pela agenda, o sistema registrou o pagamento, mas não atualizou essa ficha de venda. Por isso:
  - a página do pacote mostra R$ 3.800 em 27/08 sem forma de pagamento;
  - o perfil da cliente esconde o pagamento: como existe uma venda para o pacote, ele ignora o recebimento feito pela agenda, e a venda aparece como não paga;
  - no financeiro, o lançamento está em **26/09**, não em 27/08.
- É o único pacote do sistema nessa situação.

## Correção
1. **Registro da Ana Flávia:** a ficha de venda de 27/08 recebe a data e a forma de pagamento reais, tiradas do lançamento existente (26/09, Cartão de Crédito), e passa a ficar ligada a esse lançamento. Nenhum novo recebimento é criado, então nada fica duplicado.
2. **Daqui em diante, automático:** quando uma baixa de pacote for registrada, a ficha de venda do pacote é atualizada na mesma operação. Se essa atualização falhar, a baixa inteira é desfeita.
3. **A mesma informação nas três telas:** página do pacote, perfil da cliente e financeiro passam a mostrar o mesmo pagamento (data, valor e forma).
4. **Aviso de inconsistência:** se um pacote aparecer como pago sem lançamento no financeiro, a página do pacote mostra "Valor pago sem lançamento financeiro correspondente", e esse valor não conta como pago.
5. **Forma de pagamento obrigatória** em toda baixa. Um segundo clique no botão não gera um segundo recebimento.

## Detalhes técnicos
- Migração única de dados para a venda `4fc21a32…`: `paid_at = 2026-09-26`, `payment_method_id` copiado do lançamento financeiro `2797b503…`, e `financial_entries.sale_id` preenchido.
- Gatilho em `financial_entries`, ao inserir um lançamento a receber pago com `appointment_id` de uma sessão de pacote: atualiza a venda do pacote que ainda não tem pagamento (`paid_at`, forma de pagamento) e grava o `sale_id` no lançamento. Roda na mesma transação da baixa.
- Índice único parcial para que uma venda de pacote não receba dois lançamentos principais iguais (mesma sessão, mesmo valor e data).
- `useClientProfile`: o pagamento feito pela agenda deixa de ser escondido quando a venda do pacote não tem pagamento registrado.
- Na tela do pacote: mostrar a forma de pagamento do lançamento e o aviso de inconsistência.
- Testes: uma venda de pacote sem `paid_at` não esconde o pagamento feito pela agenda; o aviso aparece quando há valor pago sem lançamento.
