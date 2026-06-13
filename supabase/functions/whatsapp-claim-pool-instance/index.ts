// Claims a free UltraMsg instance from the salon-owned pool and links it to
// the requested professional. Idempotent: if the professional already has an
// assigned pool instance, returns the same one. Admin can claim for any
// professional; non-admin can only claim for themselves.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ success: false, error: 'Unauthorized' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseService = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const supabaseUser = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: cErr } = await supabaseUser.auth.getClaims(token);
    if (cErr || !claims?.claims) return json({ success: false, error: 'Invalid token' }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    let professional_id: string | undefined = body?.professional_id;

    // Permission: admin can claim for anyone; otherwise must own that professional row.
    const { data: roles } = await supabaseService
      .from('user_roles').select('role').eq('user_id', userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === 'admin');

    const { data: ownProf } = await supabaseService
      .from('professionals').select('id').eq('user_id', userId).maybeSingle();

    if (!professional_id) professional_id = ownProf?.id;
    if (!professional_id) return json({ success: false, error: 'professional_id é obrigatório.' }, 400);

    if (!isAdmin && professional_id !== ownProf?.id) {
      return json({ success: false, error: 'Sem permissão para reivindicar instância para outro profissional.' }, 403);
    }

    // Already has manual credentials? Don't overwrite.
    const { data: existingCreds } = await supabaseService
      .from('professional_whatsapp_credentials')
      .select('instance_id, is_active')
      .eq('professional_id', professional_id)
      .maybeSingle();
    if (existingCreds?.is_active && existingCreds.instance_id) {
      // Check if it came from the pool — if yes, ok; otherwise refuse to avoid silently swapping.
      const { data: poolRow } = await supabaseService
        .from('ultramsg_instance_pool')
        .select('id')
        .eq('instance_id', existingCreds.instance_id)
        .eq('assigned_professional_id', professional_id)
        .maybeSingle();
      if (!poolRow) {
        return json({
          success: false,
          error: 'Este profissional já possui credenciais próprias configuradas. Remova-as antes de usar uma instância do pool.',
        }, 409);
      }
    }

    // Atomic claim from the pool.
    const { data: claimed, error: claimErr } = await supabaseService
      .rpc('claim_ultramsg_pool_instance', { p_professional_id: professional_id });

    if (claimErr) {
      console.error('claim_ultramsg_pool_instance error', claimErr);
      return json({ success: false, error: claimErr.message }, 500);
    }
    const row = Array.isArray(claimed) ? claimed[0] : claimed;
    if (!row) {
      return json({
        success: false,
        error: 'Nenhuma instância disponível no pool. O administrador precisa adicionar mais instâncias UltraMsg.',
        pool_empty: true,
      }, 409);
    }

    // Upsert into professional_whatsapp_credentials so the rest of the app
    // (whatsapp-send, whatsapp-get-qrcode, whatsapp-check-connection) picks it up.
    const { error: upErr } = await supabaseService
      .from('professional_whatsapp_credentials')
      .upsert({
        professional_id,
        api_url: row.api_url,
        instance_id: row.instance_id,
        token: row.token,
        is_active: true,
      }, { onConflict: 'professional_id' });

    if (upErr) {
      console.error('upsert credentials error', upErr);
      return json({ success: false, error: upErr.message }, 500);
    }

    return json({
      success: true,
      professional_id,
      instance: row.instance_id,
      activated_at: row.activated_at ?? null,
      source: 'pool',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('whatsapp-claim-pool-instance error', err);
    return json({ success: false, error: msg }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
