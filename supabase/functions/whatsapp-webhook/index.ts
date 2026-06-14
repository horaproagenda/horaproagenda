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
    if (expectedToken) {
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

    // Try to act on incoming text messages: detect confirm/cancel intent.
    const data = (payload?.data || payload?.message || payload || {}) as any;
    const fromMe = data?.fromMe === true || data?.fromMe === 'true';
    const incomingType = (data?.type || payload?.event_type || '').toString();
    const isIncomingText =
      !fromMe &&
      (incomingType.includes('received') || incomingType === 'chat' || incomingType === 'text' || !!data?.body);

    if (isIncomingText) {
      const body: string = data.body || data.text || data.message || '';
      const fromRaw: string = data.from || data.phone || data.author || data.chatId || '';
      const phone = normalizePhone(fromRaw.replace(/@.*/, ''));
      const intent = detectIntent(body);

      if (phone && intent) {
        // Find the most recent upcoming or recent appointment for this phone.
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: clients } = await supabase
          .from('clients')
          .select('id, phone')
          .limit(500);
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
