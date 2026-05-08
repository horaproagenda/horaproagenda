import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Normalize Brazilian phone to E.164: +55XXXXXXXXXXX
function normalizePhone(input: string): string | null {
  const digits = (input || "").replace(/\D/g, "");
  if (!digits) return null;
  // If user passed +country code already
  if (input.trim().startsWith("+") && digits.length >= 11) return "+" + digits;
  // Brazilian: 10 (fixo) or 11 (celular). Add +55.
  if (digits.length === 10 || digits.length === 11) return "+55" + digits;
  // Already has 55 prefix
  if (digits.length === 12 || digits.length === 13) return "+" + digits;
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone } = await req.json();
    const e164 = normalizePhone(phone);
    if (!e164) {
      return new Response(
        JSON.stringify({ error: "Número de celular inválido. Use DDD + número." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
    const TWILIO_FROM = Deno.env.get("TWILIO_FROM_NUMBER");
    if (!LOVABLE_API_KEY || !TWILIO_API_KEY || !TWILIO_FROM) {
      return new Response(
        JSON.stringify({ error: "Serviço de SMS não configurado." }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // 60s cooldown
    const sixtySecondsAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("phone_verification_codes")
      .select("id")
      .eq("phone", e164)
      .gte("created_at", sixtySecondsAgo)
      .limit(1)
      .maybeSingle();

    if (recent) {
      return new Response(
        JSON.stringify({ error: "Aguarde 60 segundos antes de solicitar um novo código." }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Invalidate old codes
    await supabase.from("phone_verification_codes").delete().eq("phone", e164);

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insertErr } = await supabase
      .from("phone_verification_codes")
      .insert({ phone: e164, code, expires_at: expiresAt });
    if (insertErr) throw new Error("Erro ao gerar código");

    // Send SMS via Twilio gateway
    const body = new URLSearchParams({
      To: e164,
      From: TWILIO_FROM,
      Body: `Lume Agenda: seu código de verificação é ${code}. Válido por 10 minutos.`,
    });

    const resp = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TWILIO_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error("Twilio error:", resp.status, data);
      return new Response(
        JSON.stringify({ error: "Falha ao enviar SMS. Confira o número." }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, phone: e164 }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("send-phone-verification error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
