import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResetPasswordRequest {
  email: string;
  newPassword: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, newPassword }: ResetPasswordRequest = await req.json();
    const normalizedEmail = (email ?? "").toString().trim().toLowerCase();

    if (!normalizedEmail || !newPassword) {
      throw new Error("Email e nova senha são obrigatórios");
    }

    if (newPassword.length < 6) {
      throw new Error("A senha deve ter pelo menos 6 caracteres");
    }

    // Use service role to verify and update
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // SECURITY: Verify that a verification code was recently used for this email
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: usedCode, error: codeError } = await supabaseAdmin
      .from("verification_codes")
      .select("id")
      .eq("email", normalizedEmail)
      .not("used_at", "is", null)
      .gte("used_at", fiveMinutesAgo)
      .limit(1)
      .maybeSingle();

    if (codeError) {
      console.error("Error checking verification code:", codeError);
      throw new Error("Erro ao verificar código");
    }

    if (!usedCode) {
      console.error("No recently used verification code found for:", normalizedEmail);
      throw new Error("Código de verificação não encontrado ou expirado. Solicite um novo código.");
    }

    // Find user by email — paginate because listUsers() returns 50 per page by default.
    let user: { id: string; email?: string | null } | null = null;
    const perPage = 1000;
    for (let page = 1; page <= 50; page++) {
      const { data, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (listError) {
        console.error("Error listing users:", listError);
        throw new Error("Erro ao buscar usuário");
      }
      const found = data.users.find((u) => (u.email ?? "").toLowerCase() === normalizedEmail);
      if (found) { user = found; break; }
      if (data.users.length < perPage) break;
    }

    if (!user) {
      throw new Error("Usuário não encontrado");
    }


    // Update user password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    );

    if (updateError) {
      console.error("Error updating password:", updateError);
      throw new Error("Erro ao atualizar senha");
    }

    // Invalidate the used verification code by deleting it
    await supabaseAdmin
      .from("verification_codes")
      .delete()
      .eq("email", email.toLowerCase());

    console.log("Password updated successfully for:", email);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Senha atualizada com sucesso" 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error in reset-password:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
