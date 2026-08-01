import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveWhatsapp, whatsappStatus, whatsappEnsureConnected } from "../_shared/whatsappProvider.ts";
import { evolutionServerConfigured } from "../_shared/evolution.ts";

/** Evolution auto-hospedada = sem liberação manual de instância. */
const releaseRequired = () => !evolutionServerConfigured();

/**
 * Throttle da auto-recuperação: reiniciar o socket é caro (restart + esperas).
 * Sem limite, o polling do app disparava várias recuperações simultâneas e a
 * função estourava os recursos do worker (546 WORKER_RESOURCE_LIMIT), o que
 * fazia a UI mostrar "desconectado" mesmo com a sessão ativa.
 */
const RECOVER_COOLDOWN_MS = 60_000;
const lastRecoverAt = new Map<string, number>();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};


serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ configured: false, connected: false, provider: 'evolution', source: 'none', requiresRelease: releaseRequired(), error: 'unauthenticated', message: 'Faça login para verificar o WhatsApp.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let requested_professional_id: string | undefined;
    let body_autoRecover: boolean | undefined;
    try {
      const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
      requested_professional_id = body?.professional_id;
      body_autoRecover = body?.autoRecover;
    } catch { /* ignore */ }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseUser = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseService = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ configured: false, connected: false, provider: 'evolution', source: 'none', requiresRelease: releaseRequired(), error: 'unauthenticated', message: 'Sessão expirada. Faça login novamente.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: prof } = await supabaseService
      .from('professionals').select('id').eq('user_id', user.id).maybeSingle();
    const professional_id = prof?.id ?? null;
    if (!professional_id || (requested_professional_id && requested_professional_id !== professional_id)) {
      return new Response(JSON.stringify({ configured: false, connected: false, provider: 'evolution', source: 'none', requiresRelease: releaseRequired(), error: 'no_professional', message: 'O status do WhatsApp só pode ser consultado para o profissional vinculado ao usuário logado.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const resolved = await resolveWhatsapp(supabaseService, professional_id);
    const source = resolved.source;
    const requiresRelease = releaseRequired();
    if (source !== 'professional') {
      return new Response(JSON.stringify({
        configured: false,
        connected: false,
        provider: resolved.provider,
        source: 'none',
        requiresRelease,
        error: 'WhatsApp próprio não conectado para o profissional vinculado ao seu login.',
        message: 'Conecte seu WhatsApp em Configurações → WhatsApp.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let st: any = await whatsappStatus(resolved);

    // Auto-reconexão: se a sessão caiu (state !== 'open') mas a instância já
    // existe, reinicia o socket reaproveitando a sessão salva — evita que o
    // usuário precise escanear um novo QR Code a cada oscilação de rede.
    // Throttled: no máximo 1 tentativa a cada 60s por instância. E somente
    // quando o estado é `close` — reiniciar durante `connecting` cancela o
    // pareamento em andamento e era a causa da queda poucos minutos depois.
    const autoRecover = body_autoRecover !== false;
    const recoverKey = resolved.evolution?.instance || professional_id;
    const lastTry = lastRecoverAt.get(recoverKey) ?? 0;
    if (
      !st.connected && st.state === 'close' && autoRecover &&
      Date.now() - lastTry > RECOVER_COOLDOWN_MS
    ) {
      lastRecoverAt.set(recoverKey, Date.now());
      try {
        const recovered: any = await whatsappEnsureConnected(resolved);
        if (recovered?.connected) st = recovered;
      } catch (_) { /* mantém o status original */ }
    }


    if (professional_id && source === 'professional') {
      await supabaseService
        .from('professional_whatsapp_credentials')
        .update({
          last_checked_at: new Date().toISOString(),
          last_connected_at: st.connected ? new Date().toISOString() : undefined,
        })
        .eq('professional_id', professional_id);
    }

    // Quando o WhatsApp passa a estar conectado, garantimos que a fila de
    // mensagens travadas seja reaberta e o cron rode na hora — assim nenhuma
    // mensagem pré-programada deixa de ser enviada após reconectar.
    // Só na transição (ou a cada 5 min), para não sobrecarregar o worker.
    const flushKey = `flush:${recoverKey}`;
    const lastFlush = lastRecoverAt.get(flushKey) ?? 0;
    if (st.connected && Date.now() - lastFlush > 5 * 60_000) {
      lastRecoverAt.set(flushKey, Date.now());

      try {
        await supabaseService
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
      } catch (_) { /* ignore */ }
      try {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-appointment-reminders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: Deno.env.get('SUPABASE_ANON_KEY') || '',
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''}`,
          },
          body: JSON.stringify({ catchup: true, trigger: 'check-connection' }),
        });
      } catch (_) { /* ignore */ }
    }

    return new Response(JSON.stringify({
      configured: st.configured,
      connected: st.connected,
      provider: resolved.provider,
      source,
      requiresRelease,
      instance: st.instance ?? null,
      recovered: st.recovered === true,
      state: st.state ?? null,
      substatus: st.substatus ?? null,
      error: st.error,
      message: st.connected
        ? 'WhatsApp conectado via Evolution API'
        : (st.error || 'WhatsApp não conectado'),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ configured: false, connected: false, provider: 'evolution', error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
