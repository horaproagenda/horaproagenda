import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerificationRequest {
  email: string;
  type: 'signup' | 'login';
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, type }: VerificationRequest = await req.json();

    if (!email) {
      throw new Error("Email é obrigatório");
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Cooldown 60s
    const sixtySecondsAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: recent } = await supabaseClient
      .from("verification_codes")
      .select("id")
      .eq("email", email.toLowerCase())
      .gte("created_at", sixtySecondsAgo)
      .limit(1)
      .maybeSingle();

    if (recent) {
      return new Response(
        JSON.stringify({ error: "Aguarde 60 segundos antes de solicitar um novo código." }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    await supabaseClient
      .from("verification_codes")
      .delete()
      .eq("email", email.toLowerCase());

    const { error: insertError } = await supabaseClient
      .from("verification_codes")
      .insert({
        email: email.toLowerCase(),
        code,
        type,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error("Error inserting verification code:", insertError);
      throw new Error("Erro ao gerar código de verificação");
    }

    // Send via Lovable transactional email infrastructure
    const { error: sendError } = await supabaseClient.functions.invoke(
      'send-transactional-email',
      {
        body: {
          templateName: 'verification-code',
          recipientEmail: email,
          idempotencyKey: `verification-${email.toLowerCase()}-${Date.now()}`,
          templateData: { code, type },
        },
      }
    );

    if (sendError) {
      console.error("Error sending email:", sendError);
      throw new Error("Erro ao enviar e-mail");
    }

    return new Response(
      JSON.stringify({ success: true, message: "Código enviado para o e-mail" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error in send-verification-code:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
