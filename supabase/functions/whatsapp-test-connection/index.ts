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

    if (!creds) {
      return new Response(JSON.stringify({
        success: false, provider: 'ultramsg',
        error: 'UltraMsg não configurado para este profissional nem globalmente.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const st = await ultramsgStatus(creds);
    return new Response(JSON.stringify({
      success: st.connected,
      provider: 'ultramsg',
      source,
      instance: st.instance,
      state: st.state,
      substatus: st.substatus,
      connected: st.connected,
      message: st.connected
        ? `Conectado ao UltraMsg (instância ${st.instance}${source === 'professional' ? ' - profissional' : ' - global'}).`
        : (st.error || 'WhatsApp não conectado.'),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, provider: 'ultramsg', error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
