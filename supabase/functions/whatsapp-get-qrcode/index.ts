import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ultramsgGetQrCode, resolveProfessionalCreds } from "../_shared/ultramsg.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized - Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const supabaseService = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const requested_professional_id: string | undefined = body?.professional_id;

    const { data: prof } = await supabaseService
      .from('professionals').select('id').eq('user_id', user.id).maybeSingle();
    const professional_id = prof?.id ?? null;
    if (!professional_id || (requested_professional_id && requested_professional_id !== professional_id)) {
      return new Response(JSON.stringify({ success: false, error: 'O QR Code só pode ser gerado para o profissional vinculado ao usuário logado.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { creds, source } = await resolveProfessionalCreds(supabaseService, professional_id);
    if (!creds) {
      return new Response(JSON.stringify({ success: false, error: 'UltraMsg não configurado para este profissional nem globalmente.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const result = await ultramsgGetQrCode(creds);
    if (result.connected) {
      return new Response(JSON.stringify({
        success: true, connected: true, source,
        message: 'WhatsApp já está conectado',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!result.qrcode) {
      return new Response(JSON.stringify({
        success: false, source,
        error: 'QR Code indisponível. Aguarde alguns segundos e tente novamente.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Não retornamos `instance` ao cliente — é credencial sensível.
    return new Response(JSON.stringify({
      success: true, qrcode: result.qrcode, pairingCode: null, source,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('WhatsApp QR code error:', error);
    return new Response(JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
