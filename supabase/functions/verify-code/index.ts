import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerifyRequest {
  email: string;
  code: string;
  type?: string;
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
    const wantedType = (body?.type ?? "").toString().trim().toLowerCase();

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

    // Fetch ALL active (unused) codes for this email. E-mails may arrive out of
    // order and a user may request more than one code, so ANY matching,
    // unexpired code must be accepted — checking only the newest one caused
    // false "Código inválido" errors.
    let query = supabaseClient
      .from("verification_codes")
      .select("*")
      .eq("email", email)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(20);

    if (wantedType === "login" || wantedType === "signup") {
      query = query.eq("type", wantedType);
    }

    const { data: codes, error: findError } = await query;

    if (findError) {
      console.error("[verify-code] lookup error", findError);
      return jsonResponse({ valid: false, error: "Erro ao validar código" }, 500);
    }

    const now = Date.now();
    const active = (codes ?? []).filter(
      (row) => new Date(row.expires_at).getTime() >= now,
    );
    const expired = (codes ?? []).filter(
      (row) => new Date(row.expires_at).getTime() < now,
    );

    // Housekeeping: drop expired rows (never blocks validation).
    if (expired.length > 0) {
      await supabaseClient
        .from("verification_codes")
        .delete()
        .in("id", expired.map((row) => row.id));
    }

    if (active.length === 0) {
      console.warn("[verify-code] no active code for email", { email, wantedType });
      return jsonResponse({
        valid: false,
        error: expired.length > 0
          ? "Código expirado. Solicite um novo código."
          : "Nenhum código ativo. Solicite um novo código.",
      });
    }

    const MAX_ATTEMPTS = 5;
    const match = active.find((row) => (row.code ?? "").toString().trim() === code);

    if (!match) {
      // Wrong code — count the attempt on the newest active code.
      const newest = active[0];
      const attempts = (newest.attempts ?? 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await supabaseClient
          .from("verification_codes")
          .delete()
          .in("id", active.map((row) => row.id));
        return jsonResponse({
          valid: false,
          error: "Muitas tentativas. Solicite um novo código.",
        });
      }
      await supabaseClient
        .from("verification_codes")
        .update({ attempts })
        .eq("id", newest.id);
      console.warn("[verify-code] wrong code", { email, remaining: MAX_ATTEMPTS - attempts });
      return jsonResponse({
        valid: false,
        error: "Código incorreto. Confira os 6 dígitos recebidos por e-mail.",
      });
    }

    // Mark the matching code as used
    const { error: updateError } = await supabaseClient
      .from("verification_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", match.id);

    if (updateError) {
      console.error("[verify-code] failed to mark used", updateError);
      return jsonResponse({ valid: false, error: "Erro ao validar código" }, 500);
    }

    console.log("[verify-code] success", { email, type: match.type });
    return jsonResponse({
      valid: true,
      type: match.type,
      message: "Código verificado com sucesso",
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[verify-code] unexpected error", errorMessage);
    return jsonResponse({ valid: false, error: errorMessage }, 500);
  }
});
