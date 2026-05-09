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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY =
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

    if (!SUPABASE_URL) {
      console.error("Missing SUPABASE_URL");
      return new Response(
        JSON.stringify({ error: "Configuração do servidor: SUPABASE_URL ausente." }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    if (!ANON_KEY) {
      console.error("Missing SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY");
      return new Response(
        JSON.stringify({ error: "Configuração do servidor: SUPABASE_ANON_KEY ausente." }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    if (!SERVICE_ROLE_KEY) {
      console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
      return new Response(
        JSON.stringify({ error: "Configuração do servidor: SUPABASE_SERVICE_ROLE_KEY ausente." }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { email, type }: VerificationRequest = await req.json();

    if (!email) {
      throw new Error("Email é obrigatório");
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const supabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

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

    // Send via Lovable transactional email infrastructure.
    // The target function has verify_jwt=true and the gateway only accepts a
    // legacy JWT anon key. The env vars on this edge runtime now expose the
    // new sb_publishable_* / sb_secret_* keys which fail JWT validation.
    // The publishable JWT below is public (same one shipped in the frontend).
    const PUBLISHABLE_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zZ2NsbHJic3dvZGpvYWR5YnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NTQ5NjcsImV4cCI6MjA4MDUzMDk2N30.i7myc9A0jsBRAf4ehukJoMgl-79_GJrklch3D5_prXE";
    const sendResp = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ANON_KEY}`,
        apikey: ANON_KEY,
      },
      body: JSON.stringify({
        templateName: 'verification-code',
        recipientEmail: email,
        idempotencyKey: `verification-${email.toLowerCase()}-${Date.now()}`,
        templateData: { code, type },
      }),
    });

    if (!sendResp.ok) {
      const errText = await sendResp.text().catch(() => "");
      console.error("Error sending email:", sendResp.status, errText);
      return new Response(
        JSON.stringify({
          error: "Erro ao enviar e-mail",
          providerStatus: sendResp.status,
          providerBody: errText.slice(0, 500),
        }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
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
