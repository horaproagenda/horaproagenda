# Revisão das regras de privacidade (Documentos, Serviços, Produtos, Caixa, Financeiro)

## Regras atuais (como o sistema define)
- **Privado (somente eu):** só o dono do registro e o administrador veem.
- **Compartilhado com autorizados:** dono, administrador e quem tem "Ver dados de outros" no módulo.
- **Geral da clínica:** toda a equipe com acesso ao módulo.
- Quem não tem "Compartilhar" no módulo não vê o seletor; o banco grava como Privado.
- Quem tem "Compartilhar" começa com "Geral da clínica" pré-selecionado.

## O que será verificado
1. **Banco:** regras de leitura, edição e exclusão de cada tabela envolvida (modelos e documentos de clientes, serviços, kits, pacotes, produtos, compras, caixas, movimentações, lançamentos, formas de pagamento, bancos, bandeiras) — conferir se seguem as três opções acima e o isolamento por conta.
2. **Gravação:** se o dono e a privacidade são preenchidos pelo banco a partir de quem está logado, e se a escolha do formulário é respeitada ao criar e ao editar.
3. **Telas:** se cada página mostra o seletor quando deve, exibe a privacidade atual ao editar e não mostra registros privados de outros em listas, buscas, seletores da agenda, relatórios e avisos.
4. **Caixa e Financeiro:** financeiro próprio do profissional invisível para a clínica quando não compartilhado; caixa da clínica separado do pessoal.
5. **Teste prático no banco:** simular dois profissionais e um administrador da mesma conta e conferir, para cada opção de privacidade, quem enxerga e quem consegue editar/excluir.

## Correções
- Corrigir toda divergência encontrada entre a regra, o banco e as telas (no banco quando a falha for de acesso; na tela quando for de exibição).
- Cada correção recebe um teste que falha se for desfeita e é registrada nos comportamentos protegidos.
- Ao final: relatório em linguagem simples com o que estava errado, o que mudou e o que foi conferido de fato.

## Detalhes técnicos
- Revisar `can_see_record`, `can_write_record`, `perm`, `tg_autofill_owner_visibility` e políticas RLS das tabelas citadas via consultas somente leitura.
- Simulação com `set local role authenticated` + `request.jwt.claims` em transação com rollback (sem alterar dados reais).
- Conferir `VisibilitySelect`/`useRecordVisibility` em todos os formulários e filtros de `useProducts`, `useDocumentTemplates`, hooks de serviços/caixa/financeiro.
- Mudanças de banco via migração versionada.
