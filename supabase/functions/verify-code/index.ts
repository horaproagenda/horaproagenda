import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerifyRequest {
  email: string;
  code: string;
}

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: VerifyRequest = await req.json();
    const rawEmail = (body?.email ?? "").toString();
    const rawCode = (body?.code ?? "").toString();

    // Normalize: trim and strip non-digits from code (defensive against pasted
    // codes with spaces, dashes, or invisible characters).
    const email = rawEmail.trim().toLowerCase();
    const code = rawCode.replace(/\D/g, "").trim();

    if (!email || code.length !== 6) {
      console.warn("[verify-code] invalid input", { email, codeLen: code.length });
      return jsonResponse({ valid: false, error: "Código inválido" });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Look up the most recent active code for this email. We don't filter by
    // code value yet so we can correctly distinguish "wrong code" from
    // "no active code" and count brute-force attempts.
    const { data: latestCode, error: findError } = await supabaseClient
      .from("verification_codes")
      .select("*")
      .eq("email", email)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError) {
      console.error("[verify-code] lookup error", findError);
      return jsonResponse({ valid: false, error: "Erro ao validar código" }, 500);
    }

    if (!latestCode) {
      console.warn("[verify-code] no active code for email", { email });
      return jsonResponse({
        valid: false,
        error: "Nenhum código ativo. Solicite um novo código.",
      });
    }

    // Expiry check
    if (new Date(latestCode.expires_at).getTime() < Date.now()) {
      await supabaseClient.from("verification_codes").delete().eq("id", latestCode.id);
      return jsonResponse({ valid: false, error: "Código expirado. Solicite um novo." });
    }

    // Brute-force lockout
    const MAX_ATTEMPTS = 5;
    if ((latestCode.attempts ?? 0) >= MAX_ATTEMPTS) {
      await supabaseClient.from("verification_codes").delete().eq("id", latestCode.id);
      return jsonResponse({
        valid: false,
        error: "Muitas tentativas. Solicite um novo código.",
      });
    }

    // Code mismatch — increment attempts
    const storedCode = (latestCode.code ?? "").toString().trim();
    if (storedCode !== code) {
      const remaining = Math.max(0, MAX_ATTEMPTS - ((latestCode.attempts ?? 0) + 1));
      await supabaseClient
        .from("verification_codes")
        .update({ attempts: (latestCode.attempts ?? 0) + 1 })
        .eq("id", latestCode.id);
      console.warn("[verify-code] wrong code", { email, remaining });
      return jsonResponse({ valid: false, error: "Código inválido" });
    }

    // Mark code as used
    const { error: updateError } = await supabaseClient
      .from("verification_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", latestCode.id);

    if (updateError) {
      console.error("[verify-code] failed to mark used", updateError);
      return jsonResponse({ valid: false, error: "Erro ao validar código" }, 500);
    }

    console.log("[verify-code] success", { email, type: latestCode.type });
    return jsonResponse({
      valid: true,
      type: latestCode.type,
      message: "Código verificado com sucesso",
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[verify-code] unexpected error", errorMessage);
    return jsonResponse({ valid: false, error: errorMessage }, 500);
  }
});
