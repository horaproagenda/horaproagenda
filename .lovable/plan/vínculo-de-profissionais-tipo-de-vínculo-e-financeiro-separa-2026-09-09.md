# Vínculo de profissionais, tipo de vínculo e financeiro separado

## Resultado esperado

- Cada clínica passa a ter um **código único** próprio, exibido nas Configurações. Todo profissional cadastrado fica vinculado a esse código e tem também o seu próprio código único.
- No cadastro do profissional há um campo obrigatório **Tipo de vínculo**: Independente, Comissionado, Funcionário ou Administrador.
- **Independente**: tem financeiro e caixa completos, mas totalmente separados da clínica. Nada que ele lança entra no caixa, no extrato, nos relatórios ou no financeiro da clínica — e vice-versa. Ao marcar Independente, os outros botões de financeiro e caixa ficam desativados (com aviso explicando que ele já tem acesso total ao próprio financeiro).
- Cada profissional tem **uma conta financeira própria** e a clínica tem **a sua**. Toda movimentação fica ligada a uma dessas contas.
- Transferência entre profissional e clínica gera sempre **dois lançamentos ligados**: saída na origem e entrada no destino.

## Permissões financeiras (substituem as atuais)

Saem: "Possui seu próprio financeiro", "Compartilhar seu financeiro com administrador e recepção", "Ver pagamentos de outros profissionais", "Ver caixa de outros profissionais".

Entram, conforme o tipo de vínculo:

| Tipo | O que acessa |
| --- | --- |
| Administrador | Tudo |
| Gerente (funcionário com gestão) | Todo o financeiro e relatórios da clínica: ver, criar, editar, apagar |
| Recepcionista | Abre e fecha o caixa da clínica, registra despesas e dá baixa **apenas dos profissionais autorizados** (lista configurável por profissional) |
| Independente | Acesso total apenas ao seu caixa e financeiro |
| Comissionado | Apenas seus atendimentos, pagamentos e comissões |

Nenhum profissional vê o financeiro da clínica nem o de outro profissional. A clínica vê os atendimentos e valores necessários para calcular comissões e cobranças.

## Estrutura de dados

- **Clínica**: código único e conta financeira própria criados automaticamente para a conta existente e para novas contas.
- **Profissional**: tipo de vínculo, código único, conta financeira própria criada automaticamente.
- **Movimentações financeiras**: código próprio, clínica, conta financeira, sessão de caixa, profissional, atendimento, tipo (entrada, saída, transferência, estorno, ajuste), valor, categoria, forma de pagamento, descrição, data, usuário responsável e status. Transferências guardam o par de lançamentos vinculados.
- **Atendimentos**: passam a registrar o modelo financeiro (independente, comissionado ou clínica) além do que já têm.
- **Cobranças e parcelas**: cobrança com valor total e número de parcelas; cada parcela com número, vencimento, valor, status, data e forma de pagamento.
- **Regras de comissão** por profissional: percentual da clínica, percentual do profissional, desconto de materiais, desconto de taxas e momento da liberação (no atendimento, no pagamento ou proporcional às parcelas).
- **Comissões**: atendimento, parcela, valor bruto, valor da clínica, valor do profissional, materiais, taxas e status (pendente, disponível, pago). Em parcelado, cada parcela recebida libera a parte correspondente.
- **Fechamento de caixa**: registra saldo esperado, saldo contado e diferença.
- **Auditoria**: toda alteração relevante (movimentação, comissão, permissão, fechamento, transferência) é registrada.

## Como fica nas telas

1. **Configurações**: cartão com o código da clínica e a conta financeira da clínica.
2. **Gerenciar profissionais**: seletor de tipo de vínculo no topo do formulário; bloco Financeiro reescrito com as novas opções; ao escolher Independente ou Comissionado os botões incompatíveis ficam desativados e explicados; para Recepcionista aparece a lista de profissionais que ela pode dar baixa.
3. **Financeiro e Caixa**: passam a mostrar sempre a conta correspondente ao usuário. Independente vê apenas a própria; administrador e gerente veem a da clínica; comissionado vê seus atendimentos, pagamentos e comissões.
4. **Transferências**: nova ação "Transferir" no Financeiro, criando o par saída/entrada.

## Detalhes técnicos

- Migrações versionadas: `clinics.public_code`/conta da clínica derivadas de `account_owner_id`; `professionals.employment_type` (enum `professional_employment_type`), `public_code`; tabelas `financial_accounts`, `financial_movements`, `charges`, `charge_installments`, `commission_rules`, `commissions`, `receptionist_professional_grants`; colunas de saldo esperado/contado/diferença em `cash_registers`.
- Todas as novas tabelas com GRANTs explícitos, RLS por `account_owner_id` (RESTRICTIVE) e políticas por dono via funções `SECURITY DEFINER`.
- Migração de dados: registros financeiros atuais apontam para a conta da clínica; registros de profissional com financeiro próprio migram para a conta dele; `can_access_financial`/`can_manage_own_register` convertem para tipo Independente.
- Triggers: criação automática de conta financeira, par de lançamentos de transferência, liberação de comissão por parcela e gravação de auditoria.
- Frontend: `src/lib/permissions.ts` como fonte única dos novos papéis; `useProfessionalScopeFlags` reescrito para derivar do tipo de vínculo; hooks de financeiro/caixa filtrando por conta.
- Testes de regressão: isolamento independente↔clínica, recepção limitada aos autorizados, comissão por parcela, transferência com dois lançamentos, fechamento com diferença, auditoria.

## Fora do escopo

Assinatura/cobrança do próprio app (Asaas), WhatsApp e agenda além do necessário para aplicar as novas regras.
