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

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

async function findAuthUserByEmail(
  supabaseAdmin: ReturnType<typeof createClient>,
  normalizedEmail: string,
): Promise<{ id: string; email?: string | null } | null> {
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .ilike("email", normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (profileError) console.warn("reset-password profile lookup failed:", profileError);
  if (profile?.id) return { id: profile.id, email: profile.email };

  const { data: trial, error: trialError } = await supabaseAdmin
    .from("trial_registrations")
    .select("user_id, email")
    .eq("email", normalizedEmail)
    .not("user_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (trialError) console.warn("reset-password trial lookup failed:", trialError);
  if (trial?.user_id) return { id: trial.user_id, email: trial.email };

  const perPage = 1000;
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("reset-password listUsers failed:", error);
      throw new Error("Erro ao buscar usuário");
    }

    const found = data.users.find(
      (u) => (u.email ?? "").toString().trim().toLowerCase() === normalizedEmail,
    );
    if (found) return found;
    if (data.users.length < perPage) break;
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, newPassword }: ResetPasswordRequest = await req.json();
    const normalizedEmail = (email ?? "").toString().trim().toLowerCase();

    if (!normalizedEmail || !newPassword) {
      return jsonResponse({ error: "Email e nova senha são obrigatórios" }, 400);
    }

    if (newPassword.length < 6) {
      return jsonResponse({ error: "A senha deve ter pelo menos 6 caracteres" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // SECURITY: Verify that a verification code was recently used for this email.
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: usedCode, error: codeError } = await supabaseAdmin
      .from("verification_codes")
      .select("id")
      .eq("email", normalizedEmail)
      .eq("type", "login")
      .not("used_at", "is", null)
      .gte("used_at", fiveMinutesAgo)
      .order("used_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (codeError) {
      console.error("Error checking verification code:", codeError);
      return jsonResponse({ error: "Erro ao verificar código" }, 500);
    }

    if (!usedCode) {
      console.error("No recently used password-reset code found for:", normalizedEmail);
      return jsonResponse(
        { error: "Código de verificação não encontrado ou expirado. Solicite um novo código." },
        400,
      );
    }

    const user = await findAuthUserByEmail(supabaseAdmin, normalizedEmail);

    if (!user) {
      console.warn("reset-password user not found after valid code:", normalizedEmail);
      await supabaseAdmin.from("verification_codes").delete().eq("email", normalizedEmail).eq("type", "login");
      return jsonResponse(
        { code: "user_not_found", error: "Este e-mail não possui cadastro. Faça um novo cadastro para acessar o aplicativo." },
        404,
      );
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });

    if (updateError) {
      console.error("Error updating password:", updateError);
      const message = updateError.message?.toLowerCase() ?? "";
      if (message.includes("not found")) {
        return jsonResponse(
          { code: "user_not_found", error: "Este e-mail não possui cadastro. Faça um novo cadastro para acessar o aplicativo." },
          404,
        );
      }
      return jsonResponse({ error: "Erro ao atualizar senha" }, 500);
    }

    await supabaseAdmin.from("verification_codes").delete().eq("email", normalizedEmail).eq("type", "login");

    console.log("Password updated successfully for:", normalizedEmail);

    return jsonResponse({ success: true, message: "Senha atualizada com sucesso" });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error in reset-password:", errorMessage);
    return jsonResponse({ error: "Erro ao alterar senha. Tente novamente." }, 500);
  }
});
