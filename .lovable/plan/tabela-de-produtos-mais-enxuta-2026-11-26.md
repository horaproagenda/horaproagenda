# Tabela de Produtos mais enxuta

## O que muda
Na lista da página Produtos ficam só quatro colunas: **Produto**, **Estoque**, **Status** e **Ações**.

As colunas **Validade**, **Tipo de Uso** e **Atendimentos** saem da lista, mas continuam aparecendo ao abrir o produto (botão do olho ou clique na linha). Nenhum dado salvo é alterado ou apagado.

## Avisos que continuam na lista
- O selo "Baixo" no estoque e o fundo amarelo para estoque baixo continuam.
- O selo "Vencido" passa a aparecer junto à coluna Status, com o fundo vermelho da linha. Assim, um produto vencido continua visível na lista sem a coluna Validade.
- Os selos "Uso geral", marca, categoria e tipo continuam abaixo do nome.

## Detalhes do produto
A janela de detalhes já mostra Validade, Venda/Clínica e Atendimentos realizados. Vou conferir que o Status (Ativo/Inativo) também aparece ali e acrescentá-lo se faltar.

## Detalhes técnicos
- `src/pages/Produtos.tsx`: remover 3 `TableHead`/`TableCell` e mudar `colSpan` de 7 para 4. Mover o badge de vencido para a célula de Status.
- `src/components/produtos/ProductDetailDialog.tsx`: garantir o badge de Status no resumo.
- Somente apresentação: nenhuma mudança no banco.
