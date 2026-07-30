// whatsapp-connect — endpoint único para o cliente.
//
// Provisiona a instância Evolution do profissional logado e devolve APENAS o
// QR Code (imagem/texto) e o pairing code. Nenhuma credencial é exposta.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { evolutionServerConfigured, evolutionGetQrCode } from "../_shared/evolution.ts";
import { provisionEvolutionInstance } from "../_shared/whatsappProvider.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(p: unknown, status = 200) {
  return new Response(JSON.stringify(p), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ success: false, error: 'Sessão expirada. Faça login novamente.' });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseUser = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseService = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return json({ success: false, error: 'Sessão expirada. Faça login novamente.' });

    const body = await req.json().catch(() => ({}));
    const requested_professional_id: string | undefined = body?.professional_id;

    const { data: ownProf } = await supabaseService
      .from('professionals').select('id').eq('user_id', user.id).maybeSingle();

    const professional_id = ownProf?.id;
    if (!professional_id) return json({ success: false, error: 'Seu login não está vinculado a um profissional.' });
    if (requested_professional_id && requested_professional_id !== professional_id) {
      return json({ success: false, error: 'O WhatsApp só pode ser conectado ao profissional vinculado ao usuário logado.' });
    }

    if (!evolutionServerConfigured()) {
      return json({
        success: false,
        error: 'Servidor de WhatsApp não configurado. Contate o administrador.',
      });
    }

    const creds = await provisionEvolutionInstance(supabaseService, professional_id);
    const result: any = await evolutionGetQrCode(creds);
    if (result.connected) {
      return json({ success: true, connected: true, provider: 'evolution', message: 'WhatsApp já está conectado.' });
    }
    if (!result.qrcode && !result.qrText) {
      return json({
        success: false,
        provider: 'evolution',
        error: 'QR Code indisponível. Aguarde alguns segundos e tente novamente.',
      });
    }
    return json({
      success: true,
      provider: 'evolution',
      qrcode: result.qrcode ?? null,
      qrText: result.qrText ?? null,
      pairingCode: result.pairingCode ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('whatsapp-connect error', err);
    return json({ success: false, error: msg });
  }
});
