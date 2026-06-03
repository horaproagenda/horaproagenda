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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    console.log('[ultramsg-webhook] event:', JSON.stringify(payload).slice(0, 1000));

    // Best-effort log to a table if it exists; never block on errors.
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      await supabase.from('whatsapp_webhook_events').insert({
        event_type: payload?.event_type || payload?.type || 'unknown',
        payload,
      });
    } catch (e) {
      // Table may not exist — that's ok, logs above are enough.
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[ultramsg-webhook] error:', err);
    return new Response(JSON.stringify({ ok: false }), {
      status: 200, // always 200 so UltraMsg doesn't retry-spam
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
