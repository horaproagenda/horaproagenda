import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeEvolutionApiKey(rawKey: string | undefined) {
  return (rawKey || '').trim().replace(/^Bearer\s+/i, '').replace(/^['"]|['"]$/g, '');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Missing authorization header' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const supaAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Role check: only admin can pair WhatsApp / generate QR code
    const { data: roleRows } = await supabase
      .from('user_roles').select('role').eq('user_id', user.id);
    const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
    if (!roles.includes('admin')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Forbidden - admin role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Optional: per-professional instance
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const professional_id: string | undefined = body?.professional_id;

    const evolutionApiUrlRaw = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiUrl = (evolutionApiUrlRaw || '').replace(/\/+$/, '');
    const evolutionApiKey = normalizeEvolutionApiKey(Deno.env.get('EVOLUTION_API_KEY'));
    let evolutionInstance = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'default';
    const evoHeaders = {
      'apikey': evolutionApiKey,
    } as Record<string, string>;
    if (professional_id) {
      const { data: prof } = await supaAdmin
        .from('professionals').select('whatsapp_from_number').eq('id', professional_id).maybeSingle();
      const v = (prof?.whatsapp_from_number || '').trim();
      if (v.length > 0) evolutionInstance = v;
    }

    if (!evolutionApiUrl || !evolutionApiKey) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          configured: false,
          error: 'Evolution API not configured' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // First check if instance exists
    const instanceCheckResponse = await fetch(`${evolutionApiUrl}/instance/fetchInstances`, {
      method: 'GET',
      headers: evoHeaders,
    });

    let instanceExists = false;
    if (instanceCheckResponse.ok) {
      const instances = await instanceCheckResponse.json();
      instanceExists = Array.isArray(instances) && instances.some((inst: any) => 
        inst.instance?.instanceName === evolutionInstance || inst.instanceName === evolutionInstance
      );
    }

    // If instance doesn't exist, create it
    if (!instanceExists) {
      console.log('Creating new instance:', evolutionInstance);
      const createResponse = await fetch(`${evolutionApiUrl}/instance/create`, {
        method: 'POST',
        headers: { ...evoHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceName: evolutionInstance,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        }),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error('Failed to create instance:', errorText);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Failed to create instance: ${errorText}` 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const createResult = await createResponse.json();
      console.log('Instance created:', createResult);

      // If QR code is returned in creation response
      if (createResult.qrcode?.base64) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            qrcode: createResult.qrcode.base64,
            instance: evolutionInstance,
            pairingCode: createResult.qrcode?.pairingCode || null,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Connect instance to get QR code
    const encodedInstance = encodeURIComponent(evolutionInstance);
    const connectResponse = await fetch(`${evolutionApiUrl}/instance/connect/${encodedInstance}`, {
      method: 'GET',
      headers: evoHeaders,
    });

    if (!connectResponse.ok) {
      const errorText = await connectResponse.text();
      console.error('Failed to connect instance:', errorText);
      
      // Try to restart the instance
      const restartResponse = await fetch(`${evolutionApiUrl}/instance/restart/${encodedInstance}`, {
        method: 'PUT',
        headers: evoHeaders,
      });
      
      if (restartResponse.ok) {
        // Wait a moment and try again
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const retryResponse = await fetch(`${evolutionApiUrl}/instance/connect/${encodedInstance}`, {
          method: 'GET',
          headers: evoHeaders,
        });
        
        if (retryResponse.ok) {
          const retryResult = await retryResponse.json();
          if (retryResult.base64 || retryResult.qrcode?.base64) {
            return new Response(
              JSON.stringify({ 
                success: true, 
                qrcode: retryResult.base64 || retryResult.qrcode?.base64,
                instance: evolutionInstance,
                pairingCode: retryResult.pairingCode || retryResult.qrcode?.pairingCode || null,
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      }
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to get QR code: ${errorText}` 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await connectResponse.json();
    console.log('Connect result:', JSON.stringify(result));
    
    // Handle different response formats from Evolution API
    const qrcode = result.base64 || result.qrcode?.base64 || result.qrcode;
    const pairingCode = result.pairingCode || result.qrcode?.pairingCode;

    if (!qrcode) {
      // Instance might already be connected
      const stateResponse = await fetch(`${evolutionApiUrl}/instance/connectionState/${encodedInstance}`, {
        method: 'GET',
        headers: evoHeaders,
      });
      
      if (stateResponse.ok) {
        const stateResult = await stateResponse.json();
        if (stateResult.instance?.state === 'open') {
          return new Response(
            JSON.stringify({ 
              success: true, 
              connected: true,
              instance: evolutionInstance,
              message: 'WhatsApp já está conectado'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'QR Code not available. Try again in a few seconds.' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        qrcode: qrcode,
        instance: evolutionInstance,
        pairingCode: pairingCode || null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('WhatsApp QR code error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
