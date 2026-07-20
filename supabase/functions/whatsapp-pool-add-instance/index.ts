import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUltramsgConfig } from "../_shared/ultramsg.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function cleanText(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, error: 'Método inválido.' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ success: false, error: 'Faça login para adicionar instâncias.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseService = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const supabaseUser = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return json({ success: false, error: 'Sessão expirada. Faça login novamente.' }, 401);

    const { data: roles, error: roleError } = await supabaseService
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    if (roleError) return json({ success: false, error: 'Não foi possível validar sua permissão.' }, 500);
    if (!(roles ?? []).some((row: { role: string }) => row.role === 'super_admin')) {
      return json({ success: false, error: 'Apenas Super Admin pode adicionar instâncias UltraMsg.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const instanceInput = cleanText(body?.instance_id, 160);
    const token = cleanText(body?.token, 300);
    const apiUrl = cleanText(body?.api_url, 260) || null;
    const notes = cleanText(body?.notes, 500) || null;

    if (!instanceInput || !token) {
      return json({ success: false, error: 'Informe instance_id e token da UltraMsg.' }, 400);
    }

    const cfg = getUltramsgConfig({ base: apiUrl, instance: instanceInput, token });
    if (!cfg.configured) {
      return json({ success: false, error: 'Configuração UltraMsg incompleta. Confira instance_id, token e URL da API.' }, 400);
    }

    const statusUrl = `${cfg.base}/${encodeURIComponent(cfg.instanceSegment)}/instance/status?token=${encodeURIComponent(token)}`;
    const response = await fetch(statusUrl);
    const text = await response.text();
    let statusData: any = {};
    try { statusData = text ? JSON.parse(text) : {}; } catch { statusData = { raw: text.slice(0, 200) }; }

    if (!response.ok || statusData?.error) {
      const detail = typeof statusData?.error === 'string'
        ? statusData.error
        : `HTTP ${response.status}`;
      return json({
        success: false,
        error: `Não foi possível conectar à UltraMsg com essa instância/token (${detail}). Confira se a instância e o token pertencem à mesma conta.`,
      }, 400);
    }

    const accountStatus = statusData?.accountStatus || statusData?.status?.accountStatus || statusData?.status || {};
    const state = (typeof accountStatus === 'string' ? accountStatus : accountStatus?.status) || null;
    const substatus = (typeof accountStatus === 'object' ? accountStatus?.substatus : null) || null;
    const connected = state === 'authenticated' || substatus === 'connected';

    const { data: inserted, error: insertError } = await supabaseService
      .from('ultramsg_instance_pool')
      .insert({
        instance_id: cfg.instanceSegment,
        token,
        api_url: cfg.base,
        notes,
        status: 'free',
      })
      .select('id, instance_id, status')
      .single();

    if (insertError) {
      const duplicate = insertError.code === '23505';
      return json({
        success: false,
        error: duplicate
          ? 'Essa instância UltraMsg já está cadastrada no pool.'
          : insertError.message,
      }, duplicate ? 409 : 500);
    }

    return json({
      success: true,
      id: inserted?.id,
      instance_id: inserted?.instance_id,
      connected,
      state,
      substatus,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('whatsapp-pool-add-instance error', msg);
    return json({ success: false, error: msg }, 500);
  }
});