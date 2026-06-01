import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeE164(p: string): string {
  let digits = (p || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.substring(1);
  if (!digits.startsWith('55') && digits.length <= 11) digits = '55' + digits;
  return '+' + digits;
}

function normalizeEvolutionApiKey(rawKey: string | undefined) {
  return (rawKey || '').trim().replace(/^Bearer\s+/i, '').replace(/^['"]|['"]$/g, '');
}

function normalizeEvolutionNumber(phone: string): string {
  return normalizeE164(phone).replace(/\D/g, '');
}

async function getConnectionState(opts: { baseUrl: string; apiKey: string; instance: string }) {
  const r = await fetch(`${opts.baseUrl}/instance/connectionState/${encodeURIComponent(opts.instance)}`, {
    method: 'GET',
    headers: { apikey: opts.apiKey },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { connected: false, state: null, data, status: r.status };
  const state = data?.instance?.state || data?.state || data?.connectionState || null;
  return { connected: state === 'open', state, data, status: r.status };
}

async function sendWhatsappViaEvolution(opts: { instance: string; to: string; body: string }) {
  const baseUrl = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/+$/, '');
  const apiKey = normalizeEvolutionApiKey(Deno.env.get('EVOLUTION_API_KEY'));
  if (!baseUrl || !apiKey) throw new Error('Evolution API não configurada. Configure EVOLUTION_API_URL e EVOLUTION_API_KEY.');

  const state = await getConnectionState({ baseUrl, apiKey, instance: opts.instance });
  if (!state.connected) {
    throw new Error(`WhatsApp não conectado para a instância "${opts.instance}"${state.state ? ` (estado: ${state.state})` : ''}. Conecte por QR Code em Configurações → WhatsApp.`);
  }

  const r = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(opts.instance)}`, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      number: normalizeEvolutionNumber(opts.to),
      text: opts.body,
      linkPreview: false,
    }),
  });
  const data = await r.json().catch(async () => ({ raw: await r.text().catch(() => '') }));
  if (!r.ok) throw new Error(`Evolution API ${r.status}: ${JSON.stringify(data).slice(0, 500)}`);
  return data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseService = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = claimsData.claims.sub;

    const { data: roleRows } = await supabaseService
      .from('user_roles').select('role').eq('user_id', userId);
    const roles = (roleRows ?? []).map((r: any) => r.role as string);
    const isAdmin = roles.includes('admin');
    const isReceptionist = roles.includes('receptionist');
    const isProfessional = roles.includes('professional');

    if (!isAdmin && !isReceptionist && !isProfessional) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const { phone, message, client_id, test } = body as { phone: string; message: string; client_id?: string; test?: boolean };
    let { professional_id } = body as { professional_id?: string };

    if (!phone || !message) throw new Error('phone e message são obrigatórios');
    if (phone.length > 20 || message.length > 4096) throw new Error('Comprimento inválido');

    // Restrict professionals to their own clients
    if (isProfessional && !isAdmin && !isReceptionist) {
      const { data: prof } = await supabaseService
        .from('professionals').select('id').eq('user_id', userId).maybeSingle();
      const currentProfId = prof?.id ?? null;
      if (!currentProfId) {
        return new Response(JSON.stringify({ success: false, error: 'Profissional não vinculado.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      professional_id = currentProfId;

      // 'test' flag is only honored for admin/receptionist; professionals must always
      // be restricted to their assigned clients.
      const cleanIncoming = normalizeE164(phone).replace(/\D/g, '');
      let q = supabaseService.from('clients').select('id, phone').eq('assigned_professional_id', currentProfId).limit(100);
      if (client_id) q = q.eq('id', client_id);
      const { data: clientsRows } = await q;
      const ok = (clientsRows ?? []).some((c: any) => normalizeE164(c.phone || '').replace(/\D/g, '') === cleanIncoming);
      if (!ok) {
        return new Response(JSON.stringify({ success: false, error: 'Você só pode enviar para clientes vinculados a você.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (!professional_id && client_id) {
      const { data: clientRow } = await supabaseService
        .from('clients').select('assigned_professional_id').eq('id', client_id).maybeSingle();
      professional_id = clientRow?.assigned_professional_id || undefined;
    }

    // Resolve Evolution instance. Per-professional instance is stored in
    // professionals.whatsapp_from_number for backward compatibility with the
    // existing settings screen; otherwise the clinic default instance is used.
    let instance = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'default';
    if (professional_id) {
      const { data: prof } = await supabaseService
        .from('professionals').select('whatsapp_from_number').eq('id', professional_id).maybeSingle();
      const v = (prof?.whatsapp_from_number || '').trim();
      if (v) instance = v;
    }

    const result = await sendWhatsappViaEvolution({ instance, to: phone, body: message });
    return new Response(JSON.stringify({ success: true, provider: 'evolution', route: 'evolution-api', data: result, instance }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('whatsapp-send error:', error);
    return new Response(JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
