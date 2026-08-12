# Corrigir confirmação indevida ao receber qualquer mensagem no WhatsApp

## O que está acontecendo (verificado agora)

1. **Agendamento cancelado volta a ser confirmado.** A função de banco `confirm_appointment_by_token` só bloqueia horários "finalizados" e "faltou". Quando o status é *cancelado* e a ação é *confirmar*, ela troca o status para **confirmado** — exatamente o comportamento relatado.
2. **O receptor do WhatsApp escolhe de propósito agendamentos cancelados.** No filtro de candidatos, horários cancelados são mantidos na lista sempre que a intenção lida é "confirmar".
3. **Qualquer mensagem é tratada como confirmação.** A leitura de intenção aceita "ok", "obrigada", "beleza", "sim", emojis etc. Como não existe verificação de que havia uma confirmação *pendente* para aquele horário, um simples "Ok, obrigada" confirma o agendamento. Nos registros recentes isso ocorreu.
4. **A própria mensagem enviada pelo sistema volta como mensagem do cliente.** Nos registros aparece a mensagem "Presença confirmada! ✅ Seu horário: ..." chegando como entrada (duas instâncias da mesma conta conversando entre si), sendo reinterpretada como nova confirmação — um ciclo de resposta automática.
5. **O diário de mensagens está falhando.** A tabela `whatsapp_messages` aceita apenas `in`/`out` no campo de direção e o receptor grava `inbound`; todo registro de diagnóstico é descartado ("log insert failed" nos registros).

## O que será feito

1. **Regra de ouro no banco:** horário *cancelado* nunca é reativado por resposta de WhatsApp. A função de confirmação passará a recusar a ação "confirmar" quando o status for cancelado, devolvendo um aviso claro (o cliente recebe orientação para reagendar, e nada é alterado). Reagendamento continua sendo feito somente dentro do aplicativo.
2. **Só responde quem foi convidado a responder.** A confirmação por texto passa a exigir um convite de confirmação enviado recentemente para aquele horário (janela de 48 h). Sem convite pendente, a mensagem é apenas registrada e nenhum status é alterado.
3. **Escolha do horário correto:** apenas horários ativos e futuros (nunca cancelados, finalizados, faltou ou remarcados) entram na seleção.
4. **Anti-eco / anti-loop:** mensagens cujo conteúdo é idêntico às mensagens automáticas do próprio sistema, ou vindas de números da própria conta (instâncias/profissionais), são ignoradas e apenas registradas.
5. **Leitura de intenção mais rigorosa:** agradecimentos e cortesias ("ok", "obrigada", "beleza", "show") deixam de valer como confirmação. Continuam valendo "1", "confirmar", "confirmo", "sim", "estarei", "presente", ✅/👍 e equivalentes de cancelamento.
6. **Corrigir o diário de mensagens** gravando a direção no formato aceito pela tabela, para que o painel de diagnóstico em Configurações › WhatsApp volte a mostrar cada mensagem recebida, a intenção lida e o resultado (confirmado, cancelado, ignorado e o motivo).
7. **Testes** cobrindo: cortesia não confirma; mensagem sem convite pendente não altera nada; horário cancelado não volta a confirmado; eco da mensagem automática é ignorado; "1"/"confirmar" com convite pendente confirma.

## Detalhes técnicos

- Migração em `confirm_appointment_by_token`: incluir `rescheduled` na lista de status finais e retornar `success=false` com `reason='cancelled'` quando `status='cancelled'` e `p_action='confirm'`.
- `supabase/functions/whatsapp-webhook/index.ts`:
  - remover o `|| intent === 'confirm'` do filtro de candidatos; filtrar `status not in (completed, missed, rescheduled, cancelled)` e `start_time >= now()`;
  - exigir registro em `appointment_reminder_log` (ou `whatsapp_send_queue` de confirmação) para o agendamento nas últimas 48 h antes de aplicar a intenção; caso contrário `outcome='no_pending_confirmation'` sem resposta automática;
  - guarda de eco: comparar texto normalizado com os modelos de resposta automática e checar o remetente contra `professional_whatsapp_credentials`/`professionals.phone` da conta;
  - trocar `direction: 'inbound'` por `'in'` no insert de `whatsapp_messages`.
- `supabase/functions/_shared/whatsappIntent.ts`: retirar cortesias genéricas da lista de confirmação; adicionar `isEchoOfSystemMessage()`.
- Testes em `src/lib/__tests__/whatsappIntent.test.ts` e novo teste da seleção de agendamento/guarda de eco.
- Nenhuma mudança de esquema além da função de banco.
