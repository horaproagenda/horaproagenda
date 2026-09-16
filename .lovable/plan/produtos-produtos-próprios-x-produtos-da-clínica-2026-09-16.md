# Produtos: produtos próprios x produtos da clínica

## 1. Permissões do profissional (Produtos)

Hoje existem quatro opções na aba Produtos do cadastro do profissional: "Cadastrar e editar produtos", "Produtos próprios", "Ver produtos de todos" e "Ver somente próprios produtos".

Passa a existir apenas duas, mutuamente exclusivas:

- **Produtos próprios** — o profissional cria, edita e vincula produtos aos seus próprios serviços e pacotes. Estoque totalmente separado: ele não vê produtos da clínica nem de outros profissionais, e ninguém vê os dele. Compras, saídas de caixa e lançamentos financeiros desses produtos ficam na conta financeira dele, nunca na da clínica.
- **Cadastrar e editar produtos da clínica** — o profissional vê, cadastra, edita, registra entradas/saídas e vincula a serviços e pacotes os produtos da clínica.

Regras de interface e de gravação:

- Ativar uma desativa a outra automaticamente (nos dois sentidos), na tela e no que é salvo.
- "Ver produtos de todos" e "Ver somente os próprios produtos" são removidos das telas e deixam de ser considerados.
- Ao salvar, as chaves antigas são limpas para não sobrar permissão fantasma.
- Profissional sem nenhuma das duas ativas continua com produtos próprios como padrão (comportamento atual de quem só usa os seus).

## 2. Separação real dos estoques

- Produto criado por profissional com "produtos próprios" nasce marcado como dele e privado; produto criado no modo clínica nasce da clínica.
- Listagem, seleção em serviços/pacotes, consumo, alertas de estoque, notificações, relatórios e histórico passam a respeitar essa marcação: quem tem produtos próprios só enxerga os seus; quem está no modo clínica enxerga os da clínica.
- Compra de produto próprio gera saída no caixa/financeiro **do profissional**; compra de produto da clínica gera saída no caixa/financeiro da clínica. Nunca cruzado.
- As regras do banco são ajustadas para garantir isso mesmo fora da tela (leitura, criação, edição e exclusão de produtos, compras e consumo).

## 3. Página Produtos — identificação

Faixa de identificação no topo da página, compacta, com:

- Usuário (nome), ID do usuário, ID da clínica
- Tipo de usuário: "Produtos próprios" ou "Produtos da clínica" (derivado da permissão ativa)

## 4. Cadastro de produto

Campos garantidos e gravados: ID único, ID da clínica, ID do profissional que cadastrou, nome, tipo (sólido, líquido, creme, gel, em pó), unidade (unidade, ml, litro, grama, quilo) e a indicação de uso da clínica ou para venda.

## 5. Nova compra

Passa a registrar: ID único da compra, ID do produto, ID da clínica, ID e nome do profissional, nome do produto, quantidade, preço unitário, preço total, data da compra, data de validade, fornecedor e forma de pagamento.

Removidos do formulário de nova compra:

- "Para venda ou uso da clínica" — passa a vir do cadastro do produto.
- "Início do uso" e "Término do uso" — essas datas são preenchidas no controle de uso do produto, não na compra.

## Detalhes técnicos

- `ManageProfessionalsDialog.tsx` e `ProfissionalDetalhes.tsx`: reduzir a categoria `products` a `can_manage_own_products` (produtos próprios) e `can_manage_products` (produtos da clínica), com exclusão mútua no `onCheckedChange` e limpeza de `can_view_other_products` / `can_view_only_own_products` ao salvar. Migração de dados para normalizar as `permissions` jsonb existentes.
- `useProfessionalScopeFlags`: trocar `onlyOwnProducts` por um `productScope: 'own' | 'clinic'` derivado só das duas chaves; manter compatibilidade dos consumidores atuais (`useProducts`, `useStockAlertNotifications`, `productNotificationScope`).
- `useProducts`: filtrar por `owner_professional_id` (não por `created_by`), e no modo clínica exigir `owner_professional_id is null`; `createProduct` grava `owner_professional_id` + `visibility` conforme o escopo.
- `product_purchases`: adicionar `owner_professional_id` (nullable) com backfill a partir de `products`, índice, trigger de preenchimento automático e políticas RLS por dono (as atuais só cobrem `products.created_by`, o que quebra o isolamento por profissional). GRANTs preservados.
- `useProductPurchases.createPurchase`: escolher o caixa aberto do profissional dono quando o produto é próprio; caixa da clínica quando é da clínica.
- `Produtos.tsx`: nova faixa de identificação (usuário, `user.id`, `account_owner_id`, tipo); remover do `purchaseForm` os campos `is_for_sale`, `usage_start_date`, `usage_end_date`, o bloco "Uso do produto" e o switch de venda, e parar de enviar `started_using_at` / `finished_at` / `is_for_sale` no fluxo de compra (o `closePreviousActiveCycle` deixa de ser acionado pela compra).
- `ProductDetailDialog.tsx`: linha de edição de compra sem as colunas de uso removidas; datas de uso continuam no controle de ciclo.
- Testes: atualizar `productsScope.test.ts` e `productNotificationScope.test.ts`; novos testes de exclusão mútua das permissões, ausência das chaves removidas, isolamento de compras/caixa e ausência dos campos removidos no formulário de compra. Rodar `bun run test:prepublish` e validar em telas mobile e desktop.
