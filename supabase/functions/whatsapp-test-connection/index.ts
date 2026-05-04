import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeKey(raw: string | undefined | null) {
  return (raw || '').trim().replace(/^Bearer\s+/i, '').replace(/^['"]|['"]$/g, '');
}

function classifyKey(key: string) {
  // AUTHENTICATION_API_KEY do Evolution costuma ser uma string longa hex/base64 (>= 16 chars)
  // Instance API keys também são strings longas — não há garantia 100%, mas damos dicas.
  const issues: string[] = [];
  if (!key) issues.push('Chave vazia.');
  if (key.length < 16) issues.push('A chave parece curta demais (esperado ≥ 16 caracteres).');
  if (/\s/.test(key)) issues.push('A chave contém espaços — remova-os.');
  if (/^Bearer/i.test(key)) issues.push('Não inclua o prefixo "Bearer ".');
  if (/^['"].*['"]$/.test(key)) issues.push('Não inclua aspas.');
  return issues;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ ok: false, stage: 'auth', error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ ok: false, stage: 'auth', error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: roleRows } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
    const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
    if (!roles.includes('admin')) {
      return new Response(JSON.stringify({ ok: false, stage: 'role', error: 'Admin role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* ignore */ }
    const customKey: string | undefined = body?.api_key;

    const url = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/+$/, '');
    const key = normalizeKey(customKey ?? Deno.env.get('EVOLUTION_API_KEY'));
    const usingCustomKey = Boolean(customKey);

    if (!url) {
      return new Response(JSON.stringify({
        ok: false, stage: 'config',
        error: 'EVOLUTION_API_URL não está configurada.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!key) {
      return new Response(JSON.stringify({
        ok: false, stage: 'config',
        error: usingCustomKey ? 'Cole uma chave para testar.' : 'EVOLUTION_API_KEY não está configurada.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const formatHints = classifyKey(key);

    // 1) Testa endpoint que exige a global AUTHENTICATION_API_KEY: /instance/fetchInstances
    let fetchStatus = 0;
    let fetchBody = '';
    try {
      const r = await fetch(`${url}/instance/fetchInstances`, {
        method: 'GET',
        headers: { apikey: key },
      });
      fetchStatus = r.status;
      fetchBody = await r.text();
    } catch (e) {
      return new Response(JSON.stringify({
        ok: false, stage: 'network',
        error: `Falha de rede ao contatar Evolution API (${url}): ${(e as Error).message}`,
        url, formatHints,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (fetchStatus === 401 || fetchStatus === 403) {
      return new Response(JSON.stringify({
        ok: false,
        stage: 'global_auth',
        status: fetchStatus,
        error: 'A chave foi rejeitada pelo Evolution API. Provavelmente NÃO é a AUTHENTICATION_API_KEY global do servidor (a mesma usada no /manager). Confira o .env do seu Evolution.',
        evolution_response: fetchBody?.slice(0, 500),
        formatHints,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (fetchStatus >= 400) {
      return new Response(JSON.stringify({
        ok: false, stage: 'evolution',
        status: fetchStatus,
        error: `Evolution retornou ${fetchStatus} ao listar instâncias.`,
        evolution_response: fetchBody?.slice(0, 500),
        formatHints,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let instances: any[] = [];
    try { instances = JSON.parse(fetchBody); } catch { /* ignore */ }
    const instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'default';
    const exists = Array.isArray(instances) && instances.some((i: any) =>
      i?.instance?.instanceName === instanceName || i?.instanceName === instanceName);

    return new Response(JSON.stringify({
      ok: true,
      stage: 'success',
      message: usingCustomKey
        ? 'Chave válida! Você pode salvá-la com segurança no secret EVOLUTION_API_KEY.'
        : 'Conexão com Evolution API OK. A chave global é válida e o QR Code pode ser gerado.',
      instances_count: Array.isArray(instances) ? instances.length : 0,
      instance_name: instanceName,
      instance_exists: exists,
      url,
      formatHints,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false, stage: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown error',
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
