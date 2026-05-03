import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

async function sendEmail(to: string, subject: string, html: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "Lume Agenda <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send email: ${error}`);
  }

  return response.json();
}



const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerificationRequest {
  email: string;
  type: 'signup' | 'login';
}

// Generate a 6-digit code
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

    // Generate verification code
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store the code in Supabase
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Cooldown: reject if a code was issued in the last 60 seconds
    const sixtySecondsAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: recent } = await supabaseClient
      .from("verification_codes")
      .select("id, created_at")
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

    // Delete any existing codes for this email
    await supabaseClient
      .from("verification_codes")
      .delete()
      .eq("email", email.toLowerCase());

    // Insert new code
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

    // Send email with code
    const subject = type === 'signup' 
      ? "Código de Verificação - Cadastro Agenda Digital"
      : "Código de Verificação - Acesso Agenda Digital";

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; padding: 20px; }
          .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 30px; }
          .header h1 { color: #1a1a2e; margin: 0; font-size: 24px; }
          .code-box { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; padding: 30px; text-align: center; margin: 20px 0; }
          .code { font-size: 36px; font-weight: bold; letter-spacing: 8px; color: white; font-family: monospace; }
          .message { color: #666; line-height: 1.6; text-align: center; }
          .footer { margin-top: 30px; text-align: center; color: #999; font-size: 12px; }
          .warning { background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 12px; margin-top: 20px; color: #856404; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🗓️ Agenda Digital</h1>
          </div>
          
          <p class="message">
            ${type === 'signup' 
              ? 'Bem-vindo! Use o código abaixo para concluir seu cadastro:' 
              : 'Use o código abaixo para acessar sua conta:'}
          </p>
          
          <div class="code-box">
            <div class="code">${code}</div>
          </div>
          
          <p class="message">
            Este código é válido por <strong>10 minutos</strong>.
          </p>
          
          <div class="warning">
            ⚠️ Se você não solicitou este código, ignore este e-mail.
          </div>
          
          <div class="footer">
            <p>Agenda Digital - Sistema de Gestão</p>
            <p>Este é um e-mail automático, não responda.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const emailResponse = await sendEmail(email, subject, htmlContent);

    console.log("Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Código enviado para o e-mail" 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error in send-verification-code:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
