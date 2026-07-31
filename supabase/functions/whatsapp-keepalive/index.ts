// whatsapp-keepalive — mantém as sessões de WhatsApp vivas no servidor.
//
// Roda por cron (a cada poucos minutos) e, para cada credencial ativa:
//  1. consulta o estado real na Evolution API;
//  2. se a sessão caiu, reinicia o socket reaproveitando a sessão salva
//     (sem exigir novo QR Code);
//  3. reaplica as configurações de estabilidade (alwaysOnline, etc.);
//  4. atualiza `last_checked_at` / `last_connected_at`.
//
// Assim o WhatsApp não fica "desconectando depois de alguns minutos" quando o
// usuário fecha a aba do app.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  evolutionServerConfigured,
  evolutionStatus,
  evolutionEnsureConnected,
  evolutionSetSettings,
  sanitizeBaseUrl,
  type EvolutionCreds,
} from "../_shared/evolution.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    if (!evolutionServerConfigured()) {
      return json({ success: false, error: 'Servidor Evolution API não configurado.' });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: rows, error } = await supabase
      .from('professional_whatsapp_credentials')
      .select('professional_id, provider, api_url, instance_id, token, is_active')
      .eq('is_active', true)
      .eq('provider', 'evolution');
    if (error) return json({ success: false, error: error.message }, 500);

    const envBase = sanitizeBaseUrl(Deno.env.get('EVOLUTION_API_URL'));
    const envKey = (Deno.env.get('EVOLUTION_API_KEY') || '').trim();

    const results: Array<Record<string, unknown>> = [];

    // Fonte da verdade = secrets do projeto. Se a chave/URL da VPS mudou,
    // reescreve as credenciais salvas antes de qualquer chamada, para nunca
    // rodar com valor desatualizado.
    let resynced = 0;
    if (envBase && envKey) {
      const stale = (rows ?? []).filter((r) => r.token !== envKey || r.api_url !== envBase);
      for (const row of stale) {
        await supabase
          .from('professional_whatsapp_credentials')
          .update({ token: envKey, api_url: envBase, updated_at: new Date().toISOString() })
          .eq('professional_id', row.professional_id);
        row.token = envKey;
        row.api_url = envBase;
        resynced++;
      }
    }

    for (const row of rows ?? []) {
      if (!row.instance_id) continue;
      const creds: EvolutionCreds = {
        base: envBase || row.api_url,
        apiKey: envKey || row.token,
        instance: row.instance_id,
      };


      let connected = false;
      let recovered = false;
      let state: string | null = null;
      try {
        const st: any = await evolutionStatus(creds);
        state = st.state ?? null;
        connected = st.connected === true;
        if (!connected && state && state !== 'not_created') {
          const fixed: any = await evolutionEnsureConnected(creds);
          connected = fixed.connected === true;
          recovered = connected;
          state = fixed.state ?? state;
        }
        if (connected) await evolutionSetSettings(creds);
      } catch (e) {
        state = e instanceof Error ? e.message.slice(0, 120) : 'error';
      }

      await supabase
        .from('professional_whatsapp_credentials')
        .update({
          last_checked_at: new Date().toISOString(),
          ...(connected ? { last_connected_at: new Date().toISOString() } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('professional_id', row.professional_id);

      results.push({ professional_id: row.professional_id, connected, recovered, state });
    }

    // Sessões que voltaram: destrava a fila de mensagens presas por desconexão.
    if (results.some((r) => r.connected)) {
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
      } catch (_) { /* ignore */ }
    }

    return json({ success: true, checked: results.length, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('whatsapp-keepalive error', e);
    return json({ success: false, error: msg }, 500);
  }
});
