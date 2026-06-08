// Mantém todas as instâncias UltraMsg do pool "quentes" para evitar que
// caiam e exijam novo QR Code (custo = nova instância paga). Rodada por
// pg_cron a cada 5 minutos.
//
// Para cada instância em status 'assigned':
//  1. Consulta status no UltraMsg
//  2. Atualiza last_checked_at / last_connected_at
//  3. Não force restart (que invalida sessão); só verifica e mantém ativo
//     — o próprio fato do ping mantém o socket vivo.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ultramsgStatus } from "../_shared/ultramsg.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Controle de acesso: cron usa apikey (anon) sem Authorization;
    // chamadas manuais devem vir de um Super Admin autenticado.
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: roles } = await supabase
        .from('user_roles').select('role').eq('user_id', user.id);
      const isSuper = (roles ?? []).some((r: any) => r.role === 'super_admin');
      if (!isSuper) {
        return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { data: rows } = await supabase
      .from('ultramsg_instance_pool')
      .select('id, instance_id, token, api_url, assigned_professional_id')
      .eq('status', 'assigned');

    let connected = 0;
    let total = 0;
    for (const row of rows ?? []) {
      total++;
      try {
        const st = await ultramsgStatus({
          base: row.api_url, instance: row.instance_id, token: row.token,
        });
        const now = new Date().toISOString();
        if (row.assigned_professional_id) {
          await supabase
            .from('professional_whatsapp_credentials')
            .update({
              last_checked_at: now,
              ...(st.connected ? { last_connected_at: now } : {}),
            })
            .eq('professional_id', row.assigned_professional_id);
        }
        if (st.connected) connected++;
      } catch (e) {
        console.error('[pool-healthcheck] instance check failed:', e instanceof Error ? e.message : e);
      }
    }

    console.log(`[pool-healthcheck] ${connected}/${total} healthy`);

    // Resposta minimalista — sem instance_id ou tokens.
    return new Response(JSON.stringify({
      success: true, total, connected, checked_at: new Date().toISOString(),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown';
    console.error('pool-healthcheck error', e);
    return new Response(JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

