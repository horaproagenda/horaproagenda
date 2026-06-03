import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ultramsgStatus, resolveProfessionalCreds } from "../_shared/ultramsg.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    let professional_id: string | undefined;
    try {
      const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
      professional_id = body?.professional_id;
    } catch { /* ignore */ }

    const supabaseService = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { creds, source } = await resolveProfessionalCreds(supabaseService, professional_id);

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
