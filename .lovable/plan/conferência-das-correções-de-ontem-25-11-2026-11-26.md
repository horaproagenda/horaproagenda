# Conferência das correções de ontem (25/11)

## Resultado da conferência (servidor de dados voltou a responder)
Aplicadas corretamente:
- Produtos de uso geral e duração média (campo no cadastro existe no banco).
- Avisos de produtos no celular (rotina diária agendada).
- Exclusão de produto com histórico (função nova está no banco).
- Proteção da função de limpeza de contas (somente servidor).
- Aceleração das permissões (343 regras já no formato rápido).
- Prazo de 20 dias, nitidez no iPhone, cache das páginas, Precificação e aviso de servidor fora do ar (estão no código salvo).

NÃO aplicada:
- Exclusão de produto vendido como item extra em atendimento. A regra antiga do banco continua exigindo o produto, então a exclusão desses produtos falharia. Hoje nenhum atendimento tem produto extra, mas o primeiro que tiver vai travar a exclusão.

## O que será feito
1. Aplicar a correção pendente: o item extra do atendimento passa a guardar nome e valor do produto e pode ficar sem o produto depois que ele for apagado. Atendimentos e valores recebidos não mudam.
2. Ajustar o vínculo do item extra com o produto para não bloquear a exclusão.
3. Rodar os testes de exclusão de produto e os testes gerais, e conferir no banco que a regra nova está ativa.

## Detalhes técnicos
- Migração: adicionar `product_name_snapshot` (se ausente) em `appointment_additional_items`, preencher a partir de `products`; trocar `appointment_additional_items_item_ref_check` para permitir `product_id IS NULL` quando `item_type='product'` e houver snapshot; recriar FK `product_id` com `ON DELETE SET NULL`.
- Ajustar `delete_product_safe` para gravar o snapshot antes de anular a referência.
- Teste de regressão em `product-delete-safe.test.ts` cobrindo item extra.
