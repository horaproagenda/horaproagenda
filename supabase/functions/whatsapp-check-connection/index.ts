import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ultramsgStatus, resolveProfessionalCreds } from "../_shared/ultramsg.ts";
import { evolutionStatus, getEvolutionConfig } from "../_shared/evolution.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ configured: false, connected: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let requested_professional_id: string | undefined;
    try {
      const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
      requested_professional_id = body?.professional_id;
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
      return new Response(JSON.stringify({ configured: false, connected: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: prof } = await supabaseService
      .from('professionals').select('id').eq('user_id', user.id).maybeSingle();
    const professional_id = prof?.id ?? null;
    if (!professional_id || (requested_professional_id && requested_professional_id !== professional_id)) {
      return new Response(JSON.stringify({ configured: false, connected: false, error: 'O status do WhatsApp só pode ser consultado para o profissional vinculado ao usuário logado.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const evolution = getEvolutionConfig();
    let evolutionFallback: any = null;
    if (evolution.configured) {
      const st = await evolutionStatus();
      evolutionFallback = {
        configured: st.configured,
        connected: st.connected,
        provider: 'evolution',
        source: 'global',
        instance: st.instance ?? null,
        state: st.state ?? null,
        error: st.error,
        message: st.connected
          ? 'WhatsApp conectado via Evolution API'
          : (st.error || 'WhatsApp não conectado'),
      };
      if (st.connected) {
        return new Response(JSON.stringify(evolutionFallback), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const { creds, source } = await resolveProfessionalCreds(supabaseService, professional_id);
    if (!creds && evolutionFallback) {
      return new Response(JSON.stringify(evolutionFallback), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const st = await ultramsgStatus(creds);

    if (professional_id && source === 'professional' && creds) {
      await supabaseService
        .from('professional_whatsapp_credentials')
        .update({
          last_checked_at: new Date().toISOString(),
          last_connected_at: st.connected ? new Date().toISOString() : undefined,
        })
        .eq('professional_id', professional_id);
    }

    return new Response(JSON.stringify({
      configured: st.configured,
      connected: st.connected,
      provider: 'ultramsg',
      source,
      instance: st.instance ?? null,
      state: st.state ?? null,
      substatus: st.substatus ?? null,
      error: st.error,
      message: st.connected
        ? `WhatsApp conectado via UltraMsg (${source === 'professional' ? 'conta do profissional' : 'conta do salão'})`
        : (st.error || 'WhatsApp não conectado'),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ configured: false, connected: false, provider: 'ultramsg', error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
