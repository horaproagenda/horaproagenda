// WhatsApp webhook receiver (Evolution API).
// Public endpoint (no JWT) — a Evolution API posta os eventos aqui.
// Configure esta URL no webhook da instância Evolution.


import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  decideReplyAction,
  detectIntent,
  extractMessageText,
  extractSenderPhone,
  INTENT_WINDOW_HOURS,
  isEchoOfSystemMessage,
  normalizePhone,
  phonesMatch,
  type ReplyCandidate,
} from "../_shared/whatsappIntent.ts";


import { resolveWhatsapp, whatsappSendText } from "../_shared/whatsappProvider.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const BR_TZ = 'America/Sao_Paulo';

function formatWhen(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString('pt-BR', { timeZone: BR_TZ, day: '2-digit', month: '2-digit' });
    const time = d.toLocaleTimeString('pt-BR', { timeZone: BR_TZ, hour: '2-digit', minute: '2-digit' });
    return `${date} às ${time}`;
  } catch { return ''; }
}


serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Token opcional de verificação do webhook.
    const expectedToken = Deno.env.get('WHATSAPP_WEBHOOK_TOKEN') || '';
    const url = new URL(req.url);
    const incoming =
      url.searchParams.get('token') ||
      req.headers.get('x-webhook-token') ||
      '';

    // Fail-closed: sem segredo configurado, não há como distinguir eventos
    // legítimos da Evolution API de payloads forjados (que poderiam confirmar
    // ou cancelar agendamentos reais). Rejeita até o segredo ser configurado.
    if (!expectedToken) {
      console.error('[whatsapp-webhook] WHATSAPP_WEBHOOK_TOKEN não configurado — rejeitando evento.');
      return new Response(JSON.stringify({ ok: false, error: 'Webhook not configured' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (incoming !== expectedToken) {
      console.warn('[whatsapp-webhook] Token inválido no webhook — rejeitando.');
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await req.json().catch(() => ({} as any));
    console.log('[whatsapp-webhook] event:', JSON.stringify(payload).slice(0, 1000));

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ---- Real-time connection status (eventos de status da instância) ----
    // A Evolution API notifica mudanças de sessão (connection.update etc).
    // Refletimos o status em professional_whatsapp_credentials para a UI
    // atualizar via realtime.

    try {
      const evt = String(
        payload?.event || payload?.event_type || payload?.type || ''
      ).toLowerCase().replace(/_/g, '.');
      const instanceId = String(
        (payload as any)?.instanceId ||
        (payload as any)?.instance_id ||
        (payload as any)?.instance ||
        (payload as any)?.data?.instanceId ||
        (payload as any)?.data?.instance_id ||
        (payload as any)?.data?.instance || ''
      ).trim();
      const isConnectionEvent =
        evt.includes('connection.update') || evt.includes('instance.status') || evt.includes('status');
      if (instanceId && isConnectionEvent) {
        const statusStr = String(
          (payload as any)?.status ||
          (payload as any)?.data?.status ||
          (payload as any)?.accountStatus?.status || ''
        ).toLowerCase();
        const substatus = String(
          (payload as any)?.substatus ||
          (payload as any)?.data?.substatus ||
          (payload as any)?.accountStatus?.substatus || ''
        ).toLowerCase();
        // Evolution v2: connection.update → data.state = open | connecting | close
        const state = String(
          (payload as any)?.data?.state || (payload as any)?.state || ''
        ).toLowerCase();

        const isConnected = state === 'open' || statusStr === 'authenticated' || substatus === 'connected';
        const isDown = state === 'close' || state === 'connecting' ||
                       ['disconnected', 'got_qr_code', 'loading', 'pending'].includes(statusStr) ||
                       ['disconnected', 'loading', 'pending'].includes(substatus);
        const patch: Record<string, any> = {
          last_checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (isConnected) patch.last_connected_at = new Date().toISOString();
        // IMPORTANTE: `is_active` indica que a credencial existe/está habilitada.
        // Uma queda momentânea NÃO pode desativar a credencial (isso fazia o app
        // reportar "WhatsApp não configurado" e impedia a reconexão automática).
        if (isConnected) patch.is_active = true;
        if (!isConnected && !isDown) {
          // evento sem informação de estado — nada a atualizar além do ping
        }

        const { error: upErr } = await supabase
          .from('professional_whatsapp_credentials')
          .update(patch)
          .eq('instance_id', instanceId);
        if (upErr) console.warn('[whatsapp-webhook] cred update error:', upErr.message);
        else console.log('[whatsapp-webhook] cred updated', { instanceId, statusStr, substatus, isConnected });

        // Ao reconectar: reabre itens travados por "não conectado" e dispara o cron
        // imediatamente para que nenhuma mensagem programada deixe de ser enviada.
        if (isConnected) {
          try {
            await supabase
              .from('whatsapp_send_queue')
              .update({
                status: 'pending',
                attempts: 0,
                next_attempt_at: new Date().toISOString(),
                last_error: null,
                updated_at: new Date().toISOString(),
              })
              .or('status.eq.failed,status.eq.pending')
              .ilike('last_error', '%não conectado%');
          } catch (e) { console.warn('[whatsapp-webhook] queue reopen failed', e); }

          try {
            const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-appointment-reminders`;
            await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: Deno.env.get('SUPABASE_ANON_KEY') || '',
                Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''}`,
              },
              body: JSON.stringify({ catchup: true, trigger: 'reconnect' }),
            });
          } catch (e) { console.warn('[whatsapp-webhook] reminders trigger failed', e); }
        }
      }
    } catch (e) {
      console.warn('[whatsapp-webhook] instance_status handler error:', e);
    }

    // ================= Respostas recebidas do cliente =================
    const data = (payload?.data || payload?.message || payload || {}) as any;

    const fromMe =
      data?.fromMe === true || data?.fromMe === 'true' ||
      data?.key?.fromMe === true || data?.key?.fromMe === 'true';

    const incomingType = (
      data?.type || payload?.event || payload?.event_type || ''
    ).toString().toLowerCase();

    const bodyText = extractMessageText(data);
    const isIncomingText = !fromMe && !!bodyText.trim();

    console.log('[whatsapp-webhook] parsed', { fromMe, incomingType, hasBody: !!bodyText, preview: bodyText.slice(0, 60) });

    if (isIncomingText) {
      const instanceId = String(
        (payload as any)?.instance ||
        (payload as any)?.instanceId ||
        (payload as any)?.instance_id ||
        data?.instance || data?.instanceId || data?.instance_id || ''
      ).trim();

      const phone = extractSenderPhone(data);
      const intent = detectIntent(bodyText);
      console.log('[whatsapp-webhook] intent detected', { phone, intent, instanceId });

      // Tenant/profissional dono da instância que recebeu a mensagem.
      let ownerId: string | null = null;
      let professionalId: string | null = null;
      if (instanceId) {
        const { data: cred } = await supabase
          .from('professional_whatsapp_credentials')
          .select('professional_id, account_owner_id')
          .eq('instance_id', instanceId)
          .maybeSingle();
        ownerId = (cred as any)?.account_owner_id ?? null;
        professionalId = (cred as any)?.professional_id ?? null;
      }

      let matchedClient: any = null;
      let target: any = null;
      let outcome = 'ignored';
      let outcomeDetail = '';
      let reply = '';

      // Eco das próprias mensagens automáticas (duas instâncias da mesma conta
      // conversando entre si) nunca deve confirmar ou cancelar nada.
      const isEcho = isEchoOfSystemMessage(bodyText);

      if (isEcho) {
        outcome = 'ignored_echo';
        outcomeDetail = 'Mensagem é o eco de uma mensagem automática do sistema.';
      } else if (!phone) {
        outcome = 'sender_unknown';
        outcomeDetail = 'Não foi possível identificar o telefone do remetente nesta mensagem.';
      } else if (!ownerId) {
        outcome = 'instance_unknown';
        outcomeDetail = `Instância "${instanceId}" não está vinculada a nenhuma conta.`;
      } else {
        // Números da própria conta (profissionais) não são clientes.
        const { data: ownPros } = await supabase
          .from('professionals')
          .select('phone')
          .eq('account_owner_id', ownerId);
        const ownNumbers = ((ownPros || []) as any[]).map((p) => p.phone).filter(Boolean);
        const isOwnNumber = ownNumbers.some((n: string) => phonesMatch(n, phone));


        if (isOwnNumber) {
          outcome = 'ignored_own_number';
          outcomeDetail = 'Mensagem veio de um número da própria conta (não é cliente).';
        } else {
        const { data: clients } = await supabase
          .from('clients')
          .select('id, name, phone')
          .eq('account_owner_id', ownerId)
          .limit(5000);
        matchedClient = (clients || []).find((c: any) => phonesMatch(c.phone || '', phone)) || null;

        if (!matchedClient) {
          outcome = 'client_not_found';
          outcomeDetail = `Nenhum cliente cadastrado com o telefone ${phone}.`;
        } else {
          // Somente horários ativos e futuros podem ser confirmados/cancelados.
          // Cancelados jamais voltam a ser confirmados por resposta.
          const nowIso = new Date().toISOString();
          const { data: appts } = await supabase
            .from('appointments')
            .select('id, confirmation_token, start_time, status')
            .eq('client_id', matchedClient.id)
            .gte('start_time', nowIso)
            .not('status', 'in', '(completed,missed,rescheduled,cancelled)')
            .order('start_time', { ascending: true })
            .limit(20);

          const rows = (appts || []) as any[];

          // Momento do último convite de confirmação enviado para cada horário.
          const invitedSince = new Date(Date.now() - INTENT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
          const invitedAt = new Map<string, string>();
          let clarifiedIds: string[] = [];
          if (rows.length) {
            const ids = rows.map((a) => a.id);
            const [{ data: logs }, { data: queued }, { data: sentAsks }] = await Promise.all([
              supabase
                .from('appointment_reminder_log')
                .select('appointment_id, sent_at')
                .in('appointment_id', ids)
                .gte('sent_at', invitedSince)
                .order('sent_at', { ascending: false }),
              supabase
                .from('whatsapp_send_queue')
                .select('appointment_id, created_at')
                .in('appointment_id', ids)
                .gte('created_at', invitedSince)
                .order('created_at', { ascending: false }),
              // Pergunta de esclarecimento já enviada para este horário?
              supabase
                .from('whatsapp_messages')
                .select('provider_payload')
                .eq('account_owner_id', ownerId)
                .eq('direction', 'out')
                .eq('status', 'clarification_sent')
                .gte('created_at', invitedSince)
                .limit(200),
            ]);
            const note = (id?: string | null, at?: string | null) => {
              if (!id || !at) return;
              const prev = invitedAt.get(id);
              if (!prev || new Date(at).getTime() > new Date(prev).getTime()) invitedAt.set(id, at);
            };
            for (const l of (logs || []) as any[]) note(l.appointment_id, l.sent_at);
            for (const q of (queued || []) as any[]) note(q.appointment_id, q.created_at);
            clarifiedIds = ((sentAsks || []) as any[])
              .map((m) => m?.provider_payload?.appointment_id)
              .filter(Boolean);
          }

          const candidates: ReplyCandidate[] = rows.map((a) => ({
            id: a.id,
            status: a.status,
            start_time: a.start_time,
            confirmation_token: a.confirmation_token,
            invited_at: invitedAt.get(a.id) ?? null,
          }));

          const decision = decideReplyAction({ intent, candidates, alreadyClarifiedIds: clarifiedIds });
          const pick = (id: string) => rows.find((a) => a.id === id) || null;

          if (decision.action === 'silent') {
            outcome = decision.reason === 'intent_unclear_silenced'
              ? 'intent_unclear_silenced'
              : decision.reason === 'settled'
                ? 'settled_conversation'
                : 'no_pending_confirmation';
            outcomeDetail = decision.reason === 'intent_unclear_silenced'
              ? 'Pergunta de confirmação já enviada antes — mensagem apenas registrada.'
              : decision.reason === 'settled'
                ? 'Horário já confirmado ou cancelado — conversa livre, sem resposta automática.'
                : 'Nenhuma confirmação pendente para este cliente — mensagem apenas registrada.';
          } else if (decision.action === 'ask_clarification') {
            target = pick(decision.appointmentId);
            outcome = 'intent_unclear';
            outcomeDetail = 'Resposta não compreendida — pergunta enviada uma única vez.';
            reply = `Não entendi sua resposta 🙂\n\nResponda *1* para *confirmar* o horário de ${formatWhen(target?.start_time)} ou *2* para *cancelar*.`;
          } else if (decision.action === 'already_confirmed') {
            target = pick(decision.appointmentId);
            outcome = 'already_confirmed';
            outcomeDetail = 'Horário já estava confirmado.';
            reply = `Seu horário de *${formatWhen(target?.start_time)}* já está confirmado. ✅\n\nSe precisar de algo, é só escrever por aqui. 🙏`;
          } else {
            target = pick(decision.appointmentId);
            if (!target?.confirmation_token) {
              outcome = 'appointment_not_found';
              outcomeDetail = 'Agendamento sem código de confirmação.';
            } else {
              const { data: rpcRes, error: rpcErr } = await (supabase as any).rpc('confirm_appointment_by_token', {
                p_token: target.confirmation_token,
                p_action: intent,
              });
              if (rpcErr || !rpcRes?.success) {
                outcome = rpcRes?.reason === 'cancelled' ? 'already_cancelled' : 'error';
                outcomeDetail = rpcErr?.message || rpcRes?.error || 'Falha ao registrar a resposta.';
                if (rpcRes?.reason === 'cancelled') {
                  reply = 'Este horário está cancelado e não pode ser confirmado por aqui. Para reagendar, é só nos chamar. 🙏';
                }
              } else {
                outcome = rpcRes.status === 'confirmed' ? 'confirmed' : 'cancelled';
                const when = formatWhen(target.start_time);
                reply = rpcRes.status === 'confirmed'
                  ? `Presença confirmada! ✅\n\nSeu horário: *${when}*.\nAté breve! ✨`
                  : `Horário de *${when}* cancelado. ❌\n\nQuando quiser reagendar, é só nos chamar por aqui. 🙏`;
              }
            }
            console.log('[whatsapp-webhook] intent applied', { phone, intent, outcome, detail: outcomeDetail });
          }
        }

        }
      }

      // Registro da mensagem recebida (ferramenta de diagnóstico do fluxo).
      if (ownerId) {
        const { error: logErr } = await supabase.from('whatsapp_messages').insert({
          account_owner_id: ownerId,
          direction: 'in',

          from_number: phone || String(data?.key?.remoteJid || ''),
          to_number: instanceId || null,
          body: bodyText.slice(0, 2000),
          status: outcome,
          provider_message_id: data?.key?.id || null,
          provider_payload: {
            intent,
            outcome,
            detail: outcomeDetail,
            client_id: matchedClient?.id ?? null,
            client_name: matchedClient?.name ?? null,
            appointment_id: target?.id ?? null,
            appointment_start: target?.start_time ?? null,
            instance: instanceId || null,
            push_name: data?.pushName ?? null,
          },
        });
        if (logErr) console.warn('[whatsapp-webhook] log insert failed', logErr.message);
      }

      // Responde ao cliente pelo mesmo WhatsApp que recebeu a mensagem.
      if (reply && phone && professionalId) {
        try {
          const resolved = await resolveWhatsapp(supabase, professionalId);
          if (resolved.source === 'professional') {
            await whatsappSendText(resolved, { to: normalizePhone(phone), body: reply });
          }
        } catch (e) {
          console.warn('[whatsapp-webhook] reply failed', (e as any)?.message);
        }
      }
    }


    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[whatsapp-webhook] error:', err);
    return new Response(JSON.stringify({ ok: false }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
