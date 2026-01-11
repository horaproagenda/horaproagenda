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

    // Find the verification code
    const { data: verificationData, error: findError } = await supabaseClient
      .from("verification_codes")
      .select("*")
      .eq("email", email.toLowerCase())
      .eq("code", code)
      .single();

    if (findError || !verificationData) {
      console.error("Code not found:", findError);
      return new Response(
        JSON.stringify({ valid: false, error: "Código inválido" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

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
