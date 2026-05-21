import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TWILIO_GATEWAY = 'https://connector-gateway.lovable.dev/twilio';

function normalizeE164(p: string): string {
  let digits = (p || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.substring(1);
  if (!digits.startsWith('55') && digits.length <= 11) digits = '55' + digits;
  return '+' + digits;
}

async function sendWhatsappViaTwilio(opts: { from: string; to: string; body: string }) {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY não configurado');
  if (!TWILIO_API_KEY) throw new Error('TWILIO_API_KEY não configurado (conector Twilio)');

  const fromWa = opts.from.startsWith('whatsapp:') ? opts.from : `whatsapp:${normalizeE164(opts.from)}`;
  const toWa = opts.to.startsWith('whatsapp:') ? opts.to : `whatsapp:${normalizeE164(opts.to)}`;

  const r = await fetch(`${TWILIO_GATEWAY}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': TWILIO_API_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: fromWa, To: toWa, Body: opts.body }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${JSON.stringify(data)}`);
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

    // Resolve "From" WhatsApp number
    let from: string | null = null;
    if (professional_id) {
      const { data: prof } = await supabaseService
        .from('professionals').select('whatsapp_from_number').eq('id', professional_id).maybeSingle();
      const v = (prof?.whatsapp_from_number || '').trim();
      if (v) from = v;
    }
    if (!from) {
      const { data: bs } = await supabaseService
        .from('business_settings').select('twilio_from_number').limit(1).maybeSingle();
      const v = (bs?.twilio_from_number || '').trim();
      if (v) from = v;
    }
    if (!from) throw new Error('Número remetente do WhatsApp não configurado. Defina em Configurações → WhatsApp.');

    const result = await sendWhatsappViaTwilio({ from, to: phone, body: message });
    return new Response(JSON.stringify({ success: true, data: result, from }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('whatsapp-send error:', error);
    return new Response(JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
