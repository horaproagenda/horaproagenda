# Correção definitiva das datas de uso dos produtos

## Objetivo
Separar totalmente o registro de compra do registro de uso: comprar apenas aumenta o estoque; início e término do uso só são gravados quando a pessoa informa e confirma as respectivas datas.

## Implementação
- Remover da nova compra a opção e a lógica que iniciam um ciclo automaticamente, inclusive para produtos sem ciclo ativo ou com estoque zerado.
- Ao registrar uma compra, salvar `started_using_at` e `finished_at` como vazios e preservar no produto qualquer ciclo que já esteja ativo.
- Manter início e término no painel de detalhes, sempre mediante escolha manual da data e confirmação.
- Remover mensagens e comportamentos que prometem iniciar automaticamente a próxima compra após o término.
- Fortalecer a regra no banco para impedir que uma simples inclusão de compra preencha datas de uso por gatilhos ou sincronizações antigas.
- Corrigir inconsistências diretamente ligadas a esse fluxo, sem alterar regras de consumo, estoque ou financeiro fora do necessário.

## Proteção contra regressão
- Criar testes cobrindo compra inicial, reposição com ciclo ativo e produto com ciclo encerrado, garantindo que nenhuma compra inicie ou termine uso.
- Testar início e término manuais, preservação do estoque e sincronização do ciclo ativo.
- Validar tipos, testes de publicação, compilação e o fluxo visível da página de Produtos.

## Detalhes técnicos
- Centralizar a montagem dos dados da compra em uma função pura testável.
- Ajustar as operações da página e, se necessário, funções/gatilhos de `products` e `product_purchases` por migração aprovada.
- Manter atualização em tempo real das consultas relacionadas aos produtos e ciclos.
