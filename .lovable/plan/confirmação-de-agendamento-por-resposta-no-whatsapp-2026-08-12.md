# Confirmação de agendamento por resposta no WhatsApp

## O que está acontecendo

O sistema envia a mensagem de confirmação corretamente, mas quando o cliente **responde** ("1", "confirmar", "sim", "não posso"...) nada acontece na agenda. Verificações feitas agora:

- A tabela de mensagens do WhatsApp (`whatsapp_messages`) está **vazia**: nenhuma mensagem recebida foi registrada, ou seja, hoje não há como saber se a resposta do cliente chegou nem depurar o problema.
- O receptor do webhook só age em memória: se ele não encontrar o cliente ou o agendamento, descarta a resposta em silêncio e nunca responde ao cliente.
- A identificação do cliente é frágil: o webhook carrega no máximo 500 clientes e compara o telefone de forma exata. Números que chegam no formato novo do WhatsApp (identificador `@lid`) ou com/sem o nono dígito nunca casam.
- A escolha do agendamento a confirmar pega o mais antigo dentro de uma janela que inclui as últimas 24 horas, podendo mirar um horário já passado em vez do próximo.
- Os links de confirmação nas mensagens funcionam (a função de banco `confirm_appointment_by_token` está correta) — o problema está na leitura da resposta em texto.

## O que será feito

1. **Registrar toda mensagem recebida** em `whatsapp_messages` (número, texto, instância, intenção detectada e resultado da ação). Isso passa a ser a ferramenta de diagnóstico do fluxo.
2. **Identificar o cliente de forma robusta**: usar o número real do remetente (incluindo os campos alternativos enviados pelo WhatsApp), tolerar variações de DDI/nono dígito comparando os últimos dígitos, e buscar no banco filtrando pela clínica dona da instância — sem limite de 500 clientes.
3. **Escolher o agendamento certo**: priorizar o agendamento para o qual a confirmação foi enviada mais recentemente; se não houver, o próximo horário futuro do cliente. Nunca mirar horários finalizados.
4. **Ampliar a leitura das respostas**: aceitar respostas curtas, com emoji (👍/✅/❌), botões/listas do WhatsApp e mensagens citando a confirmação; tratar "remarcar" como pedido de cancelamento com aviso.
5. **Responder o cliente automaticamente**:
   - confirmado: mensagem de confirmação com data e hora;
   - cancelado: aviso de cancelamento com orientação de reagendamento;
   - resposta não compreendida (com confirmação pendente): pedir "1 para confirmar, 2 para cancelar".
6. **Painel de diagnóstico** em Configurações › WhatsApp: últimas respostas recebidas, intenção detectada e se o agendamento foi confirmado/cancelado, com motivo quando falhar.
7. **Garantir que as respostas cheguem**: reforçar o registro do webhook da instância (evento de mensagens) na conexão e na verificação periódica, para instâncias antigas que ficaram sem o evento configurado.

## Detalhes técnicos

- `supabase/functions/whatsapp-webhook/index.ts`: extração de remetente (`key.remoteJid`, `key.remoteJidAlt`, `key.participant`, `senderPhone`), normalização e casamento por sufixo de 8 dígitos via consulta filtrada por `account_owner_id` da instância; seleção do agendamento por `appointment_reminder_log`/`whatsapp_send_queue` do tipo confirmação e, como alternativa, `start_time >= now()`; chamada de `confirm_appointment_by_token`; insert em `whatsapp_messages` (`direction='inbound'`) com `provider_payload` resumido; envio da resposta reutilizando o provedor Evolution já existente em `_shared/whatsappProvider.ts`.
- `supabase/functions/_shared/evolution.ts`: manter `MESSAGES_UPSERT` e reaplicar `webhook/set` também no fluxo de verificação de conexão (`whatsapp-check-connection`/`whatsapp-keepalive`).
- Frontend: novo painel de respostas recebidas em `src/components/settings/` consumindo `whatsapp_messages` com escopo da conta, e testes unitários da detecção de intenção e do casamento de telefone.
- Nenhuma mudança de schema é necessária; se faltar política de leitura por conta em `whatsapp_messages`, será adicionada apenas leitura restrita ao próprio tenant.
