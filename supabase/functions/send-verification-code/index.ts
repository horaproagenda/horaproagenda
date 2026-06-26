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

async function authUserExistsByEmail(supabaseAdmin: ReturnType<typeof createClient>, email: string): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
  for (let page = 1; page <= 100; page += 1) {
    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    if (list.users.some((u) => u.email?.toLowerCase().trim() === normalized)) return true;
    if (list.users.length < 1000) return false;
  }
  return false;
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
    const normalizedEmail = (email ?? "").toString().trim().toLowerCase();
    const normalizedType = type === "login" ? "login" : "signup";

    if (!normalizedEmail) {
      throw new Error("Email é obrigatório");
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // For signup, give a clear error when the email is already registered so
    // the user understands why no code arrived (instead of silently skipping).
    // For login, keep anti-enumeration: silently succeed when unknown.
    const exists = await authUserExistsByEmail(supabaseAdmin, normalizedEmail);
    if (normalizedType === 'signup' && exists) {
      return new Response(
        JSON.stringify({
          error: "Este e-mail já está cadastrado. Faça login ou recupere sua senha.",
          code: "email_already_registered",
        }),
        { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    if (normalizedType === 'login' && !exists) {
      await new Promise((r) => setTimeout(r, 200));
      return new Response(
        JSON.stringify({ success: true, message: "Código enviado para o e-mail" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const supabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // IP-based rate limit: max 10 verification emails per IP per hour
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim()
      || req.headers.get("cf-connecting-ip")
      || "unknown";
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: ipCount } = await supabaseClient
      .from("email_verification_ip_log")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", oneHourAgo);

    if ((ipCount ?? 0) >= 10) {
      return new Response(
        JSON.stringify({ error: "Muitas solicitações deste dispositivo. Tente novamente mais tarde." }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    await supabaseClient.from("email_verification_ip_log").insert({ ip });

    // Cooldown 60s
    const sixtySecondsAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: recent } = await supabaseClient
      .from("verification_codes")
      .select("id")
      .eq("email", normalizedEmail)
      .eq("type", normalizedType)
      .gte("created_at", sixtySecondsAgo)
      .limit(1)
      .maybeSingle();

    if (recent) {
      return new Response(
        JSON.stringify({ error: "Aguarde 60 segundos antes de solicitar um novo código." }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Não apague códigos recentes do mesmo e-mail: e-mails podem chegar fora de
    // ordem. Mantemos todos os códigos não expirados por 10 min e aceitamos
    // qualquer código correto, evitando falso "Código inválido".
    await supabaseClient
      .from("verification_codes")
      .delete()
      .eq("email", normalizedEmail)
      .eq("type", normalizedType)
      .lt("expires_at", new Date().toISOString());

    const { data: insertedCode, error: insertError } = await supabaseClient
      .from("verification_codes")
      .insert({
        email: normalizedEmail,
        code,
        type: normalizedType,
        expires_at: expiresAt.toISOString(),
      })
      .select("id")
      .single();

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
        Authorization: `Bearer ${PUBLISHABLE_JWT}`,
        apikey: PUBLISHABLE_JWT,
      },
      body: JSON.stringify({
        templateName: 'verification-code',
        recipientEmail: normalizedEmail,
        idempotencyKey: `verification-${normalizedType}-${insertedCode?.id ?? Date.now()}`,
        templateData: { code, type: normalizedType },
      }),
    });

    if (!sendResp.ok) {
      if (insertedCode?.id) {
        await supabaseClient.from("verification_codes").delete().eq("id", insertedCode.id);
      }
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
