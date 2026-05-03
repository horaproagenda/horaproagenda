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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, code }: VerifyRequest = await req.json();

    if (!email || !code) {
      throw new Error("Email e código são obrigatórios");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Find the most recent unused code for this email (don't filter by code -
    // we want to count attempts even on wrong guesses)
    const { data: latestCode, error: findError } = await supabaseClient
      .from("verification_codes")
      .select("*")
      .eq("email", email.toLowerCase())
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError || !latestCode) {
      console.error("No active code:", findError);
      return new Response(
        JSON.stringify({ valid: false, error: "Código inválido ou expirado" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Check expiry first
    if (new Date(latestCode.expires_at) < new Date()) {
      await supabaseClient.from("verification_codes").delete().eq("id", latestCode.id);
      return new Response(
        JSON.stringify({ valid: false, error: "Código expirado" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Brute-force protection: lock after 5 wrong attempts
    const MAX_ATTEMPTS = 5;
    if ((latestCode.attempts ?? 0) >= MAX_ATTEMPTS) {
      await supabaseClient.from("verification_codes").delete().eq("id", latestCode.id);
      return new Response(
        JSON.stringify({ valid: false, error: "Muitas tentativas. Solicite um novo código." }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Wrong code? Increment attempts and reject
    if (latestCode.code !== code) {
      await supabaseClient
        .from("verification_codes")
        .update({ attempts: (latestCode.attempts ?? 0) + 1 })
        .eq("id", latestCode.id);
      return new Response(
        JSON.stringify({ valid: false, error: "Código inválido" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const verificationData = latestCode;

    // Check if code is expired
    const expiresAt = new Date(verificationData.expires_at);
    if (expiresAt < new Date()) {
      // Delete expired code
      await supabaseClient
        .from("verification_codes")
        .delete()
        .eq("id", verificationData.id);

      return new Response(
        JSON.stringify({ valid: false, error: "Código expirado" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Check if already used
    if (verificationData.used_at) {
      return new Response(
        JSON.stringify({ valid: false, error: "Código já utilizado" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Mark code as used
    await supabaseClient
      .from("verification_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", verificationData.id);

    return new Response(
      JSON.stringify({ 
        valid: true, 
        type: verificationData.type,
        message: "Código verificado com sucesso" 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error in verify-code:", errorMessage);
    return new Response(
      JSON.stringify({ valid: false, error: errorMessage }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
