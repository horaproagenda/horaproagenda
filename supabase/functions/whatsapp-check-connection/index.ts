import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');

    if (!LOVABLE_API_KEY || !TWILIO_API_KEY) {
      return new Response(JSON.stringify({
        configured: false, connected: false,
        error: 'Conector Twilio não conectado. Conecte em Configurações → Conectores.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const r = await fetch('https://connector-gateway.lovable.dev/api/v1/verify_credentials', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TWILIO_API_KEY,
      },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return new Response(JSON.stringify({
        configured: true, connected: false,
        outcome: 'failed', error: data?.message || `HTTP ${r.status}`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const ok = data?.outcome === 'verified' || data?.outcome === 'skipped';
    return new Response(JSON.stringify({
      configured: true,
      connected: ok,
      outcome: data?.outcome,
      latency_ms: data?.latency_ms,
      error: data?.error,
      message: ok ? 'Twilio conectado e válido' : (data?.error || 'Credenciais inválidas'),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ configured: false, connected: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
