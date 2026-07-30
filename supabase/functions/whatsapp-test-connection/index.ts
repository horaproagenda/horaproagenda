import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveWhatsapp, whatsappStatus } from "../_shared/whatsappProvider.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Require authenticated caller — we must never let a signed-in user probe
    // another clinic's WhatsApp integration by supplying an arbitrary
    // professional_id.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({
        success: false, provider: 'ultramsg',
        error: 'unauthenticated',
        message: 'Faça login para testar a conexão do WhatsApp.',
      }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
      return new Response(JSON.stringify({
        success: false, provider: 'ultramsg',
        error: 'unauthenticated',
        message: 'Sessão expirada. Faça login novamente.',
      }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Resolve the professional strictly from the authenticated user, mirroring
    // the pattern used by whatsapp-check-connection and whatsapp-get-qrcode.
    const { data: prof } = await supabaseService
      .from('professionals').select('id').eq('user_id', user.id).maybeSingle();
    const professional_id = prof?.id ?? null;
    if (!professional_id || (requested_professional_id && requested_professional_id !== professional_id)) {
      return new Response(JSON.stringify({
        success: false, provider: 'ultramsg',
        error: 'forbidden',
        message: 'A conexão do WhatsApp só pode ser testada para o profissional vinculado ao seu login.',
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const resolved = await resolveWhatsapp(supabaseService, professional_id);
    const source = resolved.source;
    const creds = source === 'professional' ? (resolved.evolution ?? resolved.ultramsg) : null;

    if (!creds) {
      return new Response(JSON.stringify({
        success: false, provider: 'ultramsg',
        error: 'UltraMsg não configurado para este profissional nem globalmente.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const st: any = await whatsappStatus(resolved);
    // Do NOT return `instance` — it is a sensitive credential identifier and
    // matches the safeguard used by whatsapp-get-qrcode.
    return new Response(JSON.stringify({
      success: st.connected,
      provider: 'ultramsg',
      source,
      state: st.state,
      substatus: st.substatus,
      connected: st.connected,
      message: st.connected
        ? `Conectado ao UltraMsg (${source === 'professional' ? 'conta do profissional' : 'conta do salão'}).`
        : (st.error || 'WhatsApp não conectado.'),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, provider: 'ultramsg', error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
