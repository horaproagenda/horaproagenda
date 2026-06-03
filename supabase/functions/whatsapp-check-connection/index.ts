import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ultramsgStatus } from "../_shared/ultramsg.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const st = await ultramsgStatus();
    return new Response(JSON.stringify({
      configured: st.configured,
      connected: st.connected,
      provider: 'ultramsg',
      instance: st.instance ?? null,
      state: st.state ?? null,
      substatus: st.substatus ?? null,
      error: st.error,
      message: st.connected ? 'WhatsApp conectado via UltraMsg' : (st.error || 'WhatsApp não conectado'),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ configured: false, connected: false, provider: 'ultramsg', error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
