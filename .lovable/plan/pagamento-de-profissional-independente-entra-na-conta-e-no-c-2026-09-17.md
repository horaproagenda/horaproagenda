# Pagamento de profissional independente entra na conta e no caixa dele

## Situação atual (verificada)

Na baixa de um atendimento, o sistema sempre registra a entrada no caixa da clínica: a tela de detalhes do agendamento envia o caixa aberto da clínica e a função de pagamento grava o lançamento financeiro e a movimentação de caixa sem identificar o profissional nem a conta financeira dele. Cada profissional já possui uma conta financeira própria criada automaticamente, e já é possível abrir um caixa próprio — mas o dinheiro do atendimento não chega lá.

## O que muda

Quando o profissional do atendimento tiver vínculo **independente**:

- A entrada é lançada na conta financeira desse profissional (não na conta da clínica).
- A movimentação de caixa vai para o caixa próprio dele.
- O lançamento financeiro fica marcado com o profissional, aparecendo no financeiro dele.
- Se ele não tiver o próprio caixa aberto, a baixa é bloqueada com o aviso: "Abra o caixa do profissional antes de registrar este pagamento." Nada é lançado no caixa da clínica.

Para administrador, funcionário e comissionado nada muda: continua tudo na conta e no caixa da clínica, como hoje.

O mesmo critério vale para o troco deixado como saldo do cliente, que segue o caixa e a conta usados no pagamento.

## Detalhes técnicos

`supabase/functions/process-payment/index.ts`:

1. Após carregar o agendamento, buscar `professionals.id, employment_type` do profissional do atendimento e derivar `isIndependent = employment_type === 'independente'`.
2. Resolver o destino do dinheiro:
   - independente → caixa aberto com `professional_id = <profissional>` e `status='open'` no tenant do chamador; conta em `financial_accounts` com `professional_id = <profissional>` (criar via `ensure_financial_accounts(owner)` se ausente).
   - demais vínculos → comportamento atual (caixa recebido no corpo da requisição, conta da clínica com `professional_id = NULL`).
3. Validação: se independente e sem caixa próprio aberto, responder 400 com `errors: [{ field: 'cash_register_id', message: 'Abra o caixa do profissional antes de registrar este pagamento.' }]` **antes** de qualquer gravação. Se o caixa enviado no corpo pertencer à clínica e o profissional for independente, ignorá-lo e usar o caixa próprio.
4. Gravações passam a usar o destino resolvido:
   - `financial_entries`: incluir `professional_id` (independente) — hoje fica nulo.
   - `cash_transactions`: usar o `cash_register_id` resolvido e incluir `professional_id`.
   - Novo `financial_movements` (`movement_type='entrada'`, `status='confirmado'`) com `financial_account_id` da conta resolvida, `cash_session_id` do caixa, `professional_id`, `appointment_id`, valor, categoria, forma de pagamento, descrição e `created_by` — mantendo a mesma verificação de idempotência (fingerprint) já usada para não duplicar em retentativa.
5. Aplicar a mesma resolução ao bloco de saldo/troco (7a) e ao saldo pendente, para que caixa e conta fiquem coerentes.

`src/components/appointments/AppointmentDetailDialog.tsx`:

- Usar `myOpenRegister`/`clinicOpenRegister` de `useCashRegisters` conforme o vínculo do profissional do atendimento e enviar o caixa correto.
- A checagem que hoje exige caixa aberto (linha ~1553) passa a exigir o caixa próprio quando o profissional for independente, com a mensagem acima.

Regressão (`src/__tests__/regression/`): novo teste garantindo que a função consulta `employment_type`, bloqueia sem caixa próprio do independente, grava `financial_movements` com a conta do profissional e mantém clínica para os outros vínculos.

Verificação: `bunx tsgo --noEmit`, `bun run test:prepublish` e leitura de `/tmp/observability/build-errors.log`.
