import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  SIGNUP_GRANT_TTL_SECONDS,
  newOpaqueToken,
  newRequestId,
  normalizeVerificationCode,
  normalizeVerificationEmail,
  sha256,
  verificationError,
} from "../_shared/verification.ts";

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
    const wantedType = (body?.type ?? "").toString().trim().toLowerCase();
    const email = normalizeVerificationEmail(body?.email);
    const code = normalizeVerificationCode(body?.code);
    const requestId = newRequestId();

    if (!email || code.length !== 6) {
      console.warn("[verify-code] invalid input", { email, codeLen: code.length });
      return jsonResponse({ valid: false, error: "Código inválido" });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const grantToken = wantedType === "signup" ? newOpaqueToken() : "login-no-grant";
    const grantExpiresAt = new Date(Date.now() + SIGNUP_GRANT_TTL_SECONDS * 1000).toISOString();
    const { data: result, error: confirmError } = await supabaseClient.rpc(
      "confirm_verification_code",
      {
        p_email: email,
        p_code: code,
        p_type: wantedType,
        p_token_hash: await sha256(grantToken),
        p_request_id: requestId,
        p_grant_expires_at: grantExpiresAt,
      },
    );

    if (confirmError) {
      console.error("[verify-code] confirmation failed", { requestId, message: confirmError.message });
      return jsonResponse({ valid: false, code: "temporary_error", error: "Não foi possível conferir o código agora.", requestId }, 500);
    }

    const outcome = result as { valid?: boolean; code?: string; remaining?: number; expires_at?: string } | null;
    if (!outcome?.valid) {
      console.warn("[verify-code] rejected", { requestId, type: wantedType, reason: outcome?.code });
      return jsonResponse({
        valid: false,
        code: outcome?.code ?? "temporary_error",
        error: verificationError(outcome?.code),
        remaining: outcome?.remaining,
        requestId,
      });
    }

    console.log("[verify-code] success", { requestId, type: wantedType });
    return jsonResponse({
      valid: true,
      type: wantedType,
      signupToken: wantedType === "signup" ? grantToken : undefined,
      expiresAt: outcome.expires_at,
      requestId,
      message: "Código verificado com sucesso",
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[verify-code] unexpected error", errorMessage);
    return jsonResponse({ valid: false, error: errorMessage }, 500);
  }
});
