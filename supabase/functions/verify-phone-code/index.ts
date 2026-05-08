import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(input: string): string | null {
  const digits = (input || "").replace(/\D/g, "");
  if (!digits) return null;
  if (input.trim().startsWith("+") && digits.length >= 11) return "+" + digits;
  if (digits.length === 10 || digits.length === 11) return "+55" + digits;
  if (digits.length === 12 || digits.length === 13) return "+" + digits;
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { phone, code } = await req.json();
    const e164 = normalizePhone(phone);
    if (!e164 || !code) {
      return new Response(JSON.stringify({ valid: false, error: "Dados inválidos" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { data: row } = await supabase
      .from("phone_verification_codes")
      .select("*")
      .eq("phone", e164)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row) {
      return new Response(JSON.stringify({ valid: false, error: "Código inválido ou expirado" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (new Date(row.expires_at) < new Date()) {
      await supabase.from("phone_verification_codes").delete().eq("id", row.id);
      return new Response(JSON.stringify({ valid: false, error: "Código expirado" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if ((row.attempts ?? 0) >= 5) {
      await supabase.from("phone_verification_codes").delete().eq("id", row.id);
      return new Response(JSON.stringify({ valid: false, error: "Muitas tentativas. Solicite um novo código." }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (row.code !== code) {
      await supabase.from("phone_verification_codes")
        .update({ attempts: (row.attempts ?? 0) + 1 }).eq("id", row.id);
      return new Response(JSON.stringify({ valid: false, error: "Código inválido" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    await supabase.from("phone_verification_codes")
      .update({ used_at: new Date().toISOString() }).eq("id", row.id);

    return new Response(JSON.stringify({ valid: true, phone: e164 }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ valid: false, error: msg }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
});
