// whatsapp-connect — endpoint único para o cliente.
//
// Faz numa só chamada: (1) reserva instância do pool (se ainda não tem),
// (2) gera o QR Code e devolve APENAS o QR e o pairing code.
//
// Não vaza instance_id, token, api_url ou qualquer credencial UltraMsg
// para o cliente. Toda gestão de pool/custos é exclusiva do Super Admin.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ultramsgGetQrCode, resolveProfessionalCreds } from "../_shared/ultramsg.ts";

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
      return json({ success: false, error: 'Unauthorized' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseUser = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseService = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return json({ success: false, error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    let professional_id: string | undefined = body?.professional_id;

    // Permissão: admin pode conectar para qualquer profissional; senão só para si.
    const { data: roleRows } = await supabaseService
      .from('user_roles').select('role').eq('user_id', user.id);
    const roles = (roleRows ?? []).map((r: any) => r.role);
    const isAdmin = roles.includes('admin') || roles.includes('super_admin');

    const { data: ownProf } = await supabaseService
      .from('professionals').select('id').eq('user_id', user.id).maybeSingle();

    if (!professional_id) professional_id = ownProf?.id;
    if (!professional_id) return json({ success: false, error: 'professional_id é obrigatório.' }, 400);
    if (!isAdmin && professional_id !== ownProf?.id) {
      return json({ success: false, error: 'Sem permissão.' }, 403);
    }

    // 1) Reserva instância se ainda não houver
    const { data: existing } = await supabaseService
      .from('professional_whatsapp_credentials')
      .select('instance_id, is_active')
      .eq('professional_id', professional_id)
      .maybeSingle();

    if (!existing?.is_active || !existing?.instance_id) {
      const { data: claimed, error: claimErr } = await supabaseService
        .rpc('claim_ultramsg_pool_instance', { p_professional_id: professional_id });
      if (claimErr) return json({ success: false, error: claimErr.message }, 500);
      const row = Array.isArray(claimed) ? claimed[0] : claimed;
      if (!row) {
        return json({
          success: false,
          error: 'Estamos com alta demanda no momento. Tente novamente em alguns minutos.',
        }, 503);
      }
      const { error: upErr } = await supabaseService
        .from('professional_whatsapp_credentials')
        .upsert({
          professional_id,
          api_url: row.api_url,
          instance_id: row.instance_id,
          token: row.token,
          is_active: true,
        }, { onConflict: 'professional_id' });
      if (upErr) return json({ success: false, error: upErr.message }, 500);
    }

    // 2) Gera QR Code (sem expor instance_id no retorno)
    const { creds } = await resolveProfessionalCreds(supabaseService, professional_id);
    if (!creds) return json({ success: false, error: 'Conexão indisponível.' }, 500);

    const result = await ultramsgGetQrCode(creds);
    if (result.connected) {
      return json({ success: true, connected: true, message: 'WhatsApp já está conectado.' });
    }
    if (!result.qrcode) {
      return json({
        success: false,
        error: 'QR Code indisponível. Aguarde alguns segundos e tente novamente.',
      });
    }
    return json({
      success: true,
      qrcode: result.qrcode,
      pairingCode: null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('whatsapp-connect error', err);
    return json({ success: false, error: msg }, 500);
  }
});
