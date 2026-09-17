# Limpar regras antigas duplicadas em Caixa e Financeiro

## Objetivo

Remover as regras de acesso antigas "somente administrador" que ficaram duplicadas nas tabelas de registros de caixa, movimentações de caixa e lançamentos financeiros, mantendo apenas as regras com escopo (administrador, recepção e profissional autorizado sobre os próprios registros).

## O que muda na prática

- Nada muda para quem já usa o sistema hoje: as permissões atualmente em vigor continuam valendo, porque as regras mantidas cobrem tudo que as antigas cobriam.
- O conjunto de regras fica mais simples e fácil de auditar, sem duas regras concorrentes descrevendo a mesma coisa.
- Nenhum dado é apagado.

## Regras a remover

Registros de caixa (cash_registers):
- Only admins can insert cash registers
- Only admins can update cash registers

Movimentações de caixa (cash_transactions):
- Only admins can insert cash transactions
- Only admins can update cash transactions

Lançamentos financeiros (financial_entries):
- Only admins can insert financial entries
- Only admins can update financial entries
- Only admins can delete financial entries

As regras de exclusão "Only admins can delete cash registers/cash transactions" permanecem: são as únicas que autorizam exclusão nessas duas tabelas.

## Regras que permanecem

- Caixa: abertura/edição por administrador, recepção ou profissional com a permissão de abrir e fechar caixa; leitura já limitada por escopo de profissional e permissão financeira; exclusão apenas por administrador.
- Lançamentos financeiros: inserção/edição por administrador e recepção; profissional com acesso financeiro próprio cria, edita e exclui apenas os próprios lançamentos; leitura mantém a regra restritiva de privacidade financeira.
- Isolamento por clínica (tenant) e bloqueio de leitura por super admin continuam intactos.

## Detalhes técnicos

- Uma migração com `DROP POLICY IF EXISTS` para as sete políticas listadas, nas três tabelas do schema `public`.
- Nenhuma alteração de tabela, coluna, grant ou função; nenhuma política nova é criada.
- Verificação após aplicar: consultar `pg_policies` nas três tabelas e confirmar que restaram apenas as políticas com escopo, e rodar `bun run test:prepublish` (inclui os testes de bloqueio de acesso anônimo a `cash_transactions` e `financial_entries`).
