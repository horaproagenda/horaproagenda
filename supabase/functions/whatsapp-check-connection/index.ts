import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeEvolutionApiKey(rawKey: string | undefined) {
  return (rawKey || '').trim().replace(/^Bearer\s+/i, '').replace(/^['"]|['"]$/g, '');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }

    const evolutionApiUrl = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/+$/, '');
    const evolutionApiKey = normalizeEvolutionApiKey(Deno.env.get('EVOLUTION_API_KEY'));
    let instance = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'default';

    if (authHeader?.startsWith('Bearer ') && body?.professional_id) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const supaAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        const { data: prof } = await supaAdmin
          .from('professionals').select('whatsapp_from_number').eq('id', body.professional_id).maybeSingle();
        const v = (prof?.whatsapp_from_number || '').trim();
        if (v.length > 0) instance = v;
      }
    }

    if (!evolutionApiUrl || !evolutionApiKey) {
      return new Response(JSON.stringify({
        configured: false, connected: false,
        provider: 'evolution',
        error: 'Evolution API não configurada. Configure EVOLUTION_API_URL e EVOLUTION_API_KEY.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const r = await fetch(`${evolutionApiUrl}/instance/connectionState/${encodeURIComponent(instance)}`, {
      method: 'GET',
      headers: { apikey: evolutionApiKey },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return new Response(JSON.stringify({
        configured: true, connected: false,
        provider: 'evolution',
        instance,
        outcome: 'failed',
        error: data?.message || data?.error || `Evolution API HTTP ${r.status}`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const state = data?.instance?.state || data?.state || data?.connectionState || null;
    const ok = state === 'open';
    return new Response(JSON.stringify({
      configured: true,
      connected: ok,
      provider: 'evolution',
      instance,
      state,
      error: ok ? null : (data?.error || `WhatsApp não conectado${state ? ` (${state})` : ''}`),
      message: ok ? 'WhatsApp conectado via Evolution API' : `WhatsApp não conectado${state ? ` (${state})` : ''}`,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ configured: false, connected: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
