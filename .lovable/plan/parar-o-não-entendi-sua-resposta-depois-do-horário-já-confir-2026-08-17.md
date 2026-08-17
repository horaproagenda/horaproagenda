# Parar o "Não entendi sua resposta" depois do horário já confirmado ou cancelado

## O que está acontecendo

No fluxo de respostas do WhatsApp, o sistema procura um agendamento futuro do cliente e exclui apenas os horários com status `completed`, `missed`, `rescheduled` e `cancelled`. Um horário **já confirmado** continua sendo tratado como "aguardando resposta": qualquer mensagem que o cliente enviar depois (sobre outro assunto, um agradecimento, uma dúvida) cai como "resposta não compreendida" e o sistema devolve "Não entendi sua resposta... responda 1 ou 2".

O mesmo acontece quando o cliente cancela um horário e ainda tem outro horário futuro agendado: a próxima mensagem qualquer volta a receber a pergunta de confirmar/cancelar.

## Como vai funcionar depois da correção

- Horário já **confirmado** ou já **cancelado**: o cliente pode escrever livremente, sem receber a pergunta automática. A mensagem continua sendo registrada no histórico para a equipe ler e responder.
- A pergunta "Não entendi sua resposta" passa a ser enviada **somente** quando existe de fato uma confirmação pendente: horário ainda não confirmado e convite enviado recentemente (janela de 12 horas em vez das 48 horas atuais).
- A pergunta é enviada **no máximo uma vez** por agendamento. Se o cliente continuar mandando mensagens que não são "1" ou "2", o sistema não repete o pedido — apenas registra as mensagens.
- Se o cliente responder explicitamente "1" ou "2" (ou equivalentes como "confirmo"/"cancelar") ainda dentro do prazo, a confirmação/cancelamento continua funcionando exatamente como hoje.
- Cliente já confirmado que responda "1" de novo: recebe uma mensagem curta informando que o horário já está confirmado, sem repetir a pergunta.

## Detalhes técnicos

Arquivo: `supabase/functions/whatsapp-webhook/index.ts`

1. Ao selecionar candidatos, separar dois conjuntos:
   - `pendingCandidates`: status `scheduled` (aguardando resposta) — únicos elegíveis para a pergunta de esclarecimento.
   - `settledCandidates`: status `confirmed` — elegíveis para aplicar intenção explícita, mas nunca para gerar pergunta.
2. Reduzir a janela do convite (`invitedSince`) de 48h para 12h ao decidir se ainda cabe pedir esclarecimento; manter janela maior apenas para aplicar intenção explícita.
3. Antes de definir `reply` no caso `intent_unclear`, consultar `whatsapp_messages` (mesma conta, `direction = 'out'` ou `provider_payload->>appointment_id` do alvo) para verificar se a pergunta já foi enviada para aquele agendamento; se sim, registrar `outcome = 'intent_unclear_silenced'` e não responder.
4. Registrar também a mensagem enviada (`direction: 'out'`, `status: 'clarification_sent'`, `provider_payload.appointment_id`) para que a regra de "uma vez por agendamento" funcione e o painel de diagnóstico mostre o histórico.
5. Novos outcomes documentados no log: `already_confirmed`, `intent_unclear_silenced`.
6. Testes em `src/lib/__tests__/whatsappIntent.test.ts` (ou novo arquivo de teste da regra pura) cobrindo: horário confirmado não gera pergunta, pergunta enviada só uma vez, e intenção explícita continua sendo aplicada.
