import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

function jr(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function getValidatedEvolutionUrl(rawUrl: string | undefined) {
  if (!rawUrl) return { error: 'Evolution API URL not configured' } as const;
  try {
    const parsed = new URL(rawUrl.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { error: 'Evolution API URL must start with http:// or https://' } as const;
    }
    return { url: parsed.origin } as const;
  } catch {
    return { error: 'Evolution API URL inválida.' } as const;
  }
}

async function resolveInstance(supabaseAdmin: any, professional_id?: string): Promise<string> {
  const fallback = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'default';
  if (!professional_id) return fallback;
  const { data } = await supabaseAdmin
    .from('professionals').select('whatsapp_from_number').eq('id', professional_id).maybeSingle();
  const v = (data?.whatsapp_from_number || '').trim();
  return v.length > 0 ? v : fallback;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return jr({ error: 'Unauthorized' }, 401);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    const supaAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return jr({ error: 'Unauthorized - Invalid token' }, 401);

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const professional_id: string | undefined = body?.professional_id;

    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
    const validatedUrl = getValidatedEvolutionUrl(Deno.env.get('EVOLUTION_API_URL'));
    if ('error' in validatedUrl || !evolutionApiKey) {
      return jr({ success: false, configured: false, connected: false, error: validatedUrl.error ?? 'Evolution API key not configured' });
    }

    const instance = await resolveInstance(supaAdmin, professional_id);
    const url = new URL(`/instance/connectionState/${encodeURIComponent(instance)}`, validatedUrl.url);
    const response = await fetch(url.toString(), { method: 'GET', headers: { apikey: evolutionApiKey } });

    if (!response.ok) {
      const errorText = await response.text();
      return jr({ success: false, configured: true, connected: false, instance, error: errorText });
    }

    const result = await response.json();
    const isConnected = result.instance?.state === 'open';
    return jr({ success: true, configured: true, connected: isConnected, state: result.instance?.state, instance });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('WhatsApp connection check error:', error);
    return jr({ success: false, configured: true, connected: false, error: errorMessage }, 500);
  }
});
