import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { asaasBaseUrl, asaasApiKey } from "../_shared/asaas.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const base = asaasBaseUrl();
    const key = asaasApiKey();
    const keyPrefix = key.slice(0, 12);
    const res = await fetch(`${base}/customers?limit=1`, {
      headers: {
        "Content-Type": "application/json",
        access_token: key,
      },
    });
    const status = res.status;
    let body = "";
    try { body = await res.text(); } catch { /* ignore */ }
    return new Response(JSON.stringify({
      base,
      keyPrefix,
      status,
      bodyPreview: body.slice(0, 400),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
