import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ultramsgSendText, normalizeBrPhone, resolveProfessionalCreds } from "../_shared/ultramsg.ts";
import { evolutionSendText, getEvolutionConfig } from "../_shared/evolution.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const { phone, message, client_id, professional_id } = body as {
      phone: string; message: string; client_id?: string; professional_id?: string;
    };

    if (!phone || !message) throw new Error('phone e message são obrigatórios');
    if (phone.length > 20 || message.length > 4096) throw new Error('Comprimento inválido');

    // Resolve current professional (caller) to scope client checks and pick credentials default.
    let currentProfId: string | null = null;
    {
      const { data: prof } = await supabaseService
        .from('professionals').select('id').eq('user_id', userId).maybeSingle();
      currentProfId = prof?.id ?? null;
    }

    if (professional_id && professional_id !== currentProfId) {
      return new Response(JSON.stringify({ success: false, error: 'Mensagens manuais só podem sair pelo WhatsApp vinculado ao usuário logado.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (isProfessional && !isAdmin && !isReceptionist) {
      if (!currentProfId) {
        return new Response(JSON.stringify({ success: false, error: 'Profissional não vinculado.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const cleanIncoming = normalizeBrPhone(phone);
      let q = supabaseService.from('clients').select('id, phone').eq('assigned_professional_id', currentProfId).limit(100);
      if (client_id) q = q.eq('id', client_id);
      const { data: clientsRows } = await q;
      const ok = (clientsRows ?? []).some((c: any) => normalizeBrPhone(c.phone || '') === cleanIncoming);
      if (!ok) {
        return new Response(JSON.stringify({ success: false, error: 'Você só pode enviar para clientes vinculados a você.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const evolution = getEvolutionConfig();
    if (evolution.configured) {
      try {
        const result = await evolutionSendText({ to: phone, body: message });
        return new Response(JSON.stringify({
          success: true, provider: 'evolution', route: 'evolution-api',
          data: result, instance: evolution.instance, source: 'global',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (e) {
        console.warn('Evolution send failed, falling back to UltraMsg:', e);
      }
    }

    // Mensagens manuais sempre usam as credenciais do profissional vinculado ao usuário logado.
    const targetProf = currentProfId || null;
    const { creds, source } = await resolveProfessionalCreds(supabaseService, targetProf);
    if (!creds) throw new Error('UltraMsg não configurado.');

    const result = await ultramsgSendText({ to: phone, body: message }, creds);
    return new Response(JSON.stringify({
      success: true, provider: 'ultramsg', route: 'ultramsg-api',
      data: result, instance: creds.instance, source,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('whatsapp-send error:', error);
    return new Response(JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
