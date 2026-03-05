import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

function createJsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

function getValidatedEvolutionUrl(rawUrl: string | undefined) {
  if (!rawUrl) {
    return { error: 'Evolution API URL not configured' } as const;
  }

  try {
    const normalizedUrl = rawUrl.trim();
    const parsedUrl = new URL(normalizedUrl);

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { error: 'Evolution API URL must start with http:// or https://' } as const;
    }

    return { url: parsedUrl.origin } as const;
  } catch {
    return {
      error: 'Evolution API URL inválida. Atualize o secret EVOLUTION_API_URL com uma URL pública válida, por exemplo: https://seu-dominio.com',
    } as const;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return createJsonResponse({ error: 'Unauthorized - Missing authorization header' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return createJsonResponse({ error: 'Unauthorized - Invalid token' }, 401);
    }

    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
    const evolutionInstance = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'default';
    const validatedUrl = getValidatedEvolutionUrl(Deno.env.get('EVOLUTION_API_URL'));

    if ('error' in validatedUrl || !evolutionApiKey) {
      return createJsonResponse({
        success: false,
        configured: false,
        connected: false,
        error: validatedUrl.error ?? 'Evolution API key not configured',
      });
    }

    const connectionUrl = new URL(`/instance/connectionState/${encodeURIComponent(evolutionInstance)}`, validatedUrl.url);

    const response = await fetch(connectionUrl.toString(), {
      method: 'GET',
      headers: {
        'apikey': evolutionApiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return createJsonResponse({
        success: false,
        configured: true,
        connected: false,
        error: errorText,
      });
    }

    const result = await response.json();
    const isConnected = result.instance?.state === 'open';

    return createJsonResponse({
      success: true,
      configured: true,
      connected: isConnected,
      state: result.instance?.state,
      instance: evolutionInstance,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('WhatsApp connection check error:', error);
    return createJsonResponse({
      success: false,
      configured: true,
      connected: false,
      error: errorMessage,
    }, 500);
  }
});
