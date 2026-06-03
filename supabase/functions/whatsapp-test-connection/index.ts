import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ultramsgStatus, getUltramsgConfig } from "../_shared/ultramsg.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const cfg = getUltramsgConfig();
    if (!cfg.configured) {
      return new Response(JSON.stringify({
        success: false,
        provider: 'ultramsg',
        error: 'Configure ULTRAMSG_INSTANCE_ID, ULTRAMSG_TOKEN (e opcionalmente ULTRAMSG_API_URL).',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const st = await ultramsgStatus();
    return new Response(JSON.stringify({
      success: st.connected,
      provider: 'ultramsg',
      instance: st.instance,
      state: st.state,
      substatus: st.substatus,
      connected: st.connected,
      message: st.connected
        ? `Conectado ao UltraMsg (instância ${st.instance}).`
        : (st.error || 'WhatsApp não conectado.'),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, provider: 'ultramsg', error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
