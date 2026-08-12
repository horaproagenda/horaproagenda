# Excluir venda de pacote pelo Relatório → fluxo oficial em Pacotes

## Objetivo
No Financeiro › Relatório, o botão de excluir deve reconhecer se a movimentação veio de uma **venda de pacote** ou de um **serviço/venda simples**:

- **Pacote** → o usuário é levado para Financeiro › **Pacotes**, com a venda já selecionada e o formulário de cancelamento/devolução aberto (custo por aplicação, multa, forma de devolução, motivo). Ao confirmar, roda o fluxo completo já existente: devolução no Caixa, marcação da venda como cancelada, aplicações não usadas voltam a ficar indisponíveis, agenda e perfil do cliente sincronizados.
- **Serviço / venda simples / lançamento avulso** → segue a exclusão em cascata atual, sem mudança.

## Comportamento detalhado

1. Ao clicar na lixeira em Relatório, o sistema identifica a venda ligada à linha (direto, pelo lançamento financeiro ou pelo registro do Caixa) e classifica o item como pacote ou serviço.
2. Sendo pacote, em vez de abrir um formulário duplicado dentro do Relatório, o app troca para a aba Pacotes e abre o formulário oficial daquela venda, com um aviso curto explicando que a exclusão de pacote acontece por lá.
3. Se o pacote já estiver cancelado ou totalmente concluído (casos hoje escondidos da lista de Pacotes), a aba Pacotes ainda assim localiza a venda e abre a ação correta: apagar definitivamente o pacote (confirmação), em vez de pedir uma devolução já feita.
4. Se a venda do pacote não for encontrada, aparece uma mensagem clara em português explicando o motivo, sem código de erro.
5. Sem venda de pacote identificada, o diálogo de exclusão atual continua igual, com o texto ajustado para deixar claro que serve a serviços e lançamentos avulsos.

## Detalhes técnicos

- `src/components/financeiro/RelatorioConsolidado.tsx`: manter a resolução de `saleId` já existente; classificar via `single_sales.item_type` / `package_id`. Em caso de pacote, disparar navegação para a aba Pacotes (`?tab=pacotes&cancelSale=<saleId>`) em vez de abrir o `CancelPackageDialog` local. Remover o uso do dialog duplicado nesse arquivo.
- `src/pages/Financeiro.tsx`: preservar `cancelSale` ao processar os parâmetros de URL (hoje ele apaga `tab` e `entry`) e repassar como prop para `PacotesFinanceiro`.
- `src/components/financeiro/PacotesFinanceiro.tsx`: aceitar prop `focusSaleId`; ao recebê-la, buscar a linha em `rows` (lista completa, antes do filtro que esconde cancelados/concluídos), definir `selected`, e abrir `cancelOpen` para pacotes em andamento ou `deleteOpen` para cancelados/concluídos; limpar o parâmetro depois de abrir para não reabrir em re-render. Se `rows` ainda estiver carregando, aguardar; se não existir, mostrar aviso humanizado.
- Nenhuma mudança de banco: continuam sendo usados `hard_purge_service_package`, `delete_completed_or_cancelled_client_package` e `purge_single_sale_cascade` (este último só para serviços/lançamentos).
- Verificação: rodar os testes existentes e navegar no preview (Relatório → excluir venda de pacote → conferir que abre Pacotes com o formulário preenchido; e excluir venda de serviço → conferir que segue o diálogo antigo).
