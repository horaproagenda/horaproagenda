import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WhatsAppMessage {
  phone: string;
  message: string;
  professional_id?: string;
  client_id?: string;
  instanceName?: string;
}

function normalizePhone(p: string): string {
  let cleanPhone = (p || '').replace(/\D/g, '');
  if (cleanPhone.startsWith('0')) cleanPhone = '55' + cleanPhone.substring(1);
  if (!cleanPhone.startsWith('55')) cleanPhone = '55' + cleanPhone;
  return cleanPhone;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

    const body = await req.json() as WhatsAppMessage;
    const { phone, message, client_id } = body;
    let { professional_id } = body;

    if (!phone || !message) throw new Error('Phone and message are required');
    if (phone.length > 20 || message.length > 4096) throw new Error('Invalid input length');

    const cleanPhone = normalizePhone(phone);

    // Resolve current professional (if user is a professional)
    let currentProfId: string | null = null;
    if (isProfessional && !isAdmin && !isReceptionist) {
      const { data: prof } = await supabaseService
        .from('professionals').select('id').eq('user_id', userId).maybeSingle();
      currentProfId = prof?.id ?? null;
      if (!currentProfId) {
        return new Response(JSON.stringify({ success: false, error: 'Profissional não vinculado.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      // Force professional_id to be the caller
      professional_id = currentProfId;

      // Validate: phone/client must belong to a client assigned to this professional
      let q = supabaseService.from('clients').select('id, phone, assigned_professional_id').eq('assigned_professional_id', currentProfId).limit(50);
      if (client_id) q = q.eq('id', client_id);
      const { data: clientsRows } = await q;
      const phoneMatches = (clientsRows ?? []).some((c: any) => normalizePhone(c.phone || '') === cleanPhone);
      if (!phoneMatches) {
        return new Response(JSON.stringify({ success: false, error: 'Você só pode enviar mensagens para clientes vinculados a você.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Determine sender instance/number
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
    const defaultInstance = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'default';
    if (!evolutionApiUrl || !evolutionApiKey) throw new Error('Evolution API not configured');

    let instance = body.instanceName || defaultInstance;
    if (professional_id) {
      const { data: prof } = await supabaseService
        .from('professionals').select('whatsapp_from_number').eq('id', professional_id).maybeSingle();
      if (prof?.whatsapp_from_number && String(prof.whatsapp_from_number).trim().length > 0) {
        instance = String(prof.whatsapp_from_number).trim();
      }
    }

    const response = await fetch(`${evolutionApiUrl}/message/sendText/${encodeURIComponent(instance)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': evolutionApiKey },
      body: JSON.stringify({ number: cleanPhone, text: message }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Evolution API error: ${errorText}`);
    }

    const result = await response.json();
    return new Response(JSON.stringify({ success: true, data: result, instance }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('WhatsApp send error:', error);
    return new Response(JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
