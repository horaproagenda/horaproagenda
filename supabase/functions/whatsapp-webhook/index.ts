// UltraMsg webhook receiver.
// Public endpoint (no JWT) — UltraMsg posts events here.
// Configure this URL in UltraMsg dashboard for all webhook events.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function normalizePhone(phone: string): string {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = d.substring(1);
  if (!d.startsWith('55') && d.length <= 11) d = '55' + d;
  return d;
}

/** Detects intent from a free-text reply. Returns 'confirm' | 'cancel' | null. */
function detectIntent(body: string): 'confirm' | 'cancel' | null {
  const text = String(body || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (!text) return null;
  if (/^(1|confirmar|confirmo|confirmado|sim|ok|okay|presente|vou|estarei)\b/.test(text)) return 'confirm';
  if (/^(2|cancelar|cancelo|cancelado|nao|n[ãa]o|desmarcar|nao posso|n[ãa]o vou)\b/.test(text)) return 'cancel';
  if (/\bconfirm/.test(text)) return 'confirm';
  if (/\bcancel/.test(text) || /\bdesmarc/.test(text)) return 'cancel';
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const expectedToken = Deno.env.get('ULTRAMSG_WEBHOOK_TOKEN');
    if (!expectedToken) {
      console.error('[ultramsg-webhook] ULTRAMSG_WEBHOOK_TOKEN not configured — rejecting');
      return new Response(JSON.stringify({ ok: false, error: 'Webhook token not configured' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    {
      const url = new URL(req.url);
      const incoming =
        url.searchParams.get('token') ||
        req.headers.get('x-webhook-token') ||
        req.headers.get('x-ultramsg-token') ||
        '';
      if (incoming !== expectedToken) {
        return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }


    const payload = await req.json().catch(() => ({} as any));
    console.log('[ultramsg-webhook] event:', JSON.stringify(payload).slice(0, 1000));

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // best-effort log
    try {
      await supabase.from('whatsapp_webhook_events').insert({
        event_type: payload?.event_type || payload?.type || 'unknown',
        payload,
      });
    } catch { /* table may not exist */ }

    // ---- Real-time connection status (instance_status events) ----
    // UltraMsg envia event_type "instance_status" sempre que a sessão muda
    // (authenticated, disconnected, got_qr_code, etc). Refletimos o status
    // em professional_whatsapp_credentials para a UI atualizar via realtime.
    try {
      const evt = String(payload?.event_type || payload?.type || '').toLowerCase();
      const instanceId = String(
        (payload as any)?.instanceId ||
        (payload as any)?.instance_id ||
        (payload as any)?.instance ||
        (payload as any)?.data?.instanceId ||
        (payload as any)?.data?.instance_id ||
        (payload as any)?.data?.instance || ''
      ).trim();
      if (instanceId && (evt.includes('instance_status') || evt.includes('status'))) {
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
        const isConnected = statusStr === 'authenticated' || substatus === 'connected';
        const isDown = ['disconnected', 'got_qr_code', 'loading', 'pending'].includes(statusStr) ||
                       ['disconnected', 'loading', 'pending'].includes(substatus);
        const patch: Record<string, any> = { last_checked_at: new Date().toISOString() };
        if (isConnected) patch.last_connected_at = new Date().toISOString();
        if (isConnected || isDown) {
          patch.is_active = isConnected;
        }
        const { error: upErr } = await supabase
          .from('professional_whatsapp_credentials')
          .update(patch)
          .eq('instance_id', instanceId);
        if (upErr) console.warn('[ultramsg-webhook] cred update error:', upErr.message);
        else console.log('[ultramsg-webhook] cred updated', { instanceId, statusStr, substatus, isConnected });

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
          } catch (e) { console.warn('[ultramsg-webhook] queue reopen failed', e); }

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
          } catch (e) { console.warn('[ultramsg-webhook] reminders trigger failed', e); }
        }
      }
    } catch (e) {
      console.warn('[ultramsg-webhook] instance_status handler error:', e);
    }

    // Try to act on incoming text messages: detect confirm/cancel intent.
    // Supports BOTH UltraMsg and Evolution API (v2/v6) payload shapes.
    const data = (payload?.data || payload?.message || payload || {}) as any;

    // Evolution: data.key.fromMe — UltraMsg: data.fromMe
    const fromMe =
      data?.fromMe === true || data?.fromMe === 'true' ||
      data?.key?.fromMe === true || data?.key?.fromMe === 'true';

    const incomingType = (
      data?.type || payload?.event || payload?.event_type || ''
    ).toString().toLowerCase();

    // Evolution message text can be in several sub-objects.
    const evoText =
      data?.message?.conversation ||
      data?.message?.extendedTextMessage?.text ||
      data?.message?.imageMessage?.caption ||
      data?.message?.videoMessage?.caption ||
      data?.message?.buttonsResponseMessage?.selectedDisplayText ||
      data?.message?.listResponseMessage?.title ||
      data?.message?.templateButtonReplyMessage?.selectedDisplayText ||
      '';

    const bodyText: string = (data?.body || data?.text || data?.message?.text || evoText || '') as string;
    const isIncomingText = !fromMe && !!bodyText;

    console.log('[ultramsg-webhook] parsed', { fromMe, incomingType, hasBody: !!bodyText, preview: String(bodyText).slice(0, 60) });

    if (isIncomingText) {
      const fromRaw: string =
        data?.from || data?.phone || data?.author || data?.chatId ||
        data?.key?.remoteJid || data?.remoteJid || '';
      const phone = normalizePhone(String(fromRaw).replace(/@.*/, ''));
      const intent = detectIntent(bodyText);
      console.log('[ultramsg-webhook] intent detected', { phone, intent });

      if (phone && intent) {
        // Find the most recent upcoming or recent appointment for this phone.
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        // Tenant scope: resolve account_owner_id from the receiving instance
        const instanceId = String(
          (payload as any)?.instanceId ||
          (payload as any)?.instance_id ||
          (payload as any)?.instance ||
          data?.instanceId ||
          data?.instance_id ||
          data?.instance || ''
        ).trim();

        const tenantOwners = new Set<string>();
        if (instanceId) {
          const { data: poolRow } = await supabase
            .from('ultramsg_instance_pool')
            .select('assigned_professional_id')
            .eq('instance_id', instanceId)
            .maybeSingle();
          if (poolRow?.assigned_professional_id) {
            const { data: prof } = await supabase
              .from('professionals')
              .select('account_owner_id')
              .eq('id', poolRow.assigned_professional_id)
              .maybeSingle();
            if (prof?.account_owner_id) tenantOwners.add(prof.account_owner_id);
          }
          const { data: credRows } = await supabase
            .from('professional_whatsapp_credentials')
            .select('account_owner_id')
            .eq('instance_id', instanceId);
          for (const r of credRows || []) {
            if ((r as any).account_owner_id) tenantOwners.add((r as any).account_owner_id);
          }
        }

        let clientsQuery = supabase.from('clients').select('id, phone, account_owner_id').limit(500);
        if (tenantOwners.size > 0) {
          clientsQuery = clientsQuery.in('account_owner_id', Array.from(tenantOwners));
        }
        const { data: clients } = await clientsQuery;
        const matchClient = (clients || []).find((c: any) => normalizePhone(c.phone || '') === phone);

        if (matchClient) {
          const { data: appts } = await supabase
            .from('appointments')
            .select('id, confirmation_token, start_time, status')
            .eq('client_id', matchClient.id)
            .gte('start_time', since)
            .not('status', 'in', '(completed,missed)')
            .order('start_time', { ascending: true })
            .limit(5);

          const target = (appts || []).find(
            (a: any) => a.status !== 'cancelled' || intent === 'confirm'
          ) || (appts || [])[0];

          if (target?.confirmation_token) {
            const { data: rpcRes, error: rpcErr } = await (supabase as any).rpc('confirm_appointment_by_token', {
              p_token: target.confirmation_token,
              p_action: intent,
            });
            console.log('[ultramsg-webhook] intent applied', { phone, intent, result: rpcRes, err: rpcErr?.message });
          } else {
            console.log('[ultramsg-webhook] no matching upcoming appointment for phone', phone);
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[ultramsg-webhook] error:', err);
    return new Response(JSON.stringify({ ok: false }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
