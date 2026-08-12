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

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_RULES_HINT =
  "Mínimo de 8 caracteres, com letra maiúscula, letra minúscula, número e símbolo (ex.: !@#$).";
const SYMBOLS = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

/** Mesma política de senha do aplicativo (src/lib/passwordPolicy.ts). */
function validatePassword(password: string): string | null {
  if (!password) return "Informe a nova senha.";
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `A nova senha precisa ter no mínimo ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (/\s/.test(password)) return "A nova senha não pode conter espaços.";
  if (!/[a-z]/.test(password)) return "Inclua pelo menos uma letra minúscula na nova senha.";
  if (!/[A-Z]/.test(password)) return "Inclua pelo menos uma letra maiúscula na nova senha.";
  if (!/\d/.test(password)) return "Inclua pelo menos um número na nova senha.";
  if (!SYMBOLS.test(password)) return "Inclua pelo menos um símbolo na nova senha (ex.: ! @ # $).";
  return null;
}

/** Converte a falha do serviço de autenticação em motivo + mensagem clara. */
function classifyUpdateError(error: { message?: string; code?: string; status?: number }) {
  const code = (error.code ?? "").toLowerCase();
  const message = (error.message ?? "").toLowerCase();

  if (code === "same_password" || message.includes("different from the old password")) {
    return {
      status: 400,
      code: "same_password",
      error: "A nova senha precisa ser diferente da senha atual. Escolha outra senha.",
    };
  }
  if (message.includes("at least") && message.includes("characters")) {
    return {
      status: 400,
      code: "short_password",
      error: `A nova senha é curta demais. Use no mínimo ${PASSWORD_MIN_LENGTH} caracteres.`,
    };
  }
  if (message.includes("one character of each") || message.includes("required characters")) {
    return {
      status: 400,
      code: "weak_password",
      error: `A senha não atende aos requisitos de segurança. ${PASSWORD_RULES_HINT}`,
    };
  }
  if (
    code === "weak_password" ||
    message.includes("weak") ||
    message.includes("pwned") ||
    message.includes("compromised") ||
    message.includes("easy to guess")
  ) {
    return {
      status: 400,
      code: "weak_password",
      error: `Essa senha é fraca ou já apareceu em vazamentos. ${PASSWORD_RULES_HINT}`,
    };
  }
  if (message.includes("not found")) {
    return {
      status: 404,
      code: "user_not_found",
      error: "Este e-mail não possui cadastro. Faça um novo cadastro para acessar o aplicativo.",
    };
  }
  if (code === "over_request_rate_limit" || error.status === 429 || message.includes("rate limit")) {
    return {
      status: 429,
      code: "rate_limited",
      error: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.",
    };
  }
  return {
    status: 500,
    code: "update_failed",
    error:
      "Não conseguimos gravar a nova senha agora. Tente novamente em instantes; se continuar, fale com o suporte.",
  };
}


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

  if (profileError) console.warn("[reset-password] profile lookup failed:", profileError);
  if (profile?.id) return { id: profile.id, email: profile.email };

  const { data: trial, error: trialError } = await supabaseAdmin
    .from("trial_registrations")
    .select("user_id, email")
    .eq("email", normalizedEmail)
    .not("user_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (trialError) console.warn("[reset-password] trial lookup failed:", trialError);
  if (trial?.user_id) return { id: trial.user_id, email: trial.email };

  const perPage = 1000;
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("[reset-password] listUsers failed:", error);
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
      return jsonResponse({ code: "missing_fields", error: "Informe o e-mail e a nova senha." }, 400);
    }

    const policyError = validatePassword(newPassword);
    if (policyError) {
      console.warn("[reset-password] password policy rejected", { email: normalizedEmail });
      return jsonResponse({ code: "policy", error: policyError }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // SEGURANÇA: exige um código de verificação confirmado recentemente para
    // este e-mail. Janela de 15 min (passe de redefinição) para que o usuário
    // possa tentar salvar a senha mais de uma vez sem pedir um novo código.
    const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: usedCode, error: codeError } = await supabaseAdmin
      .from("verification_codes")
      .select("id")
      .eq("email", normalizedEmail)
      .not("used_at", "is", null)
      .gte("used_at", windowStart)
      .order("used_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (codeError) {
      console.error("[reset-password] code check failed:", codeError);
      return jsonResponse(
        { code: "code_check_failed", error: "Não foi possível confirmar o código agora. Tente novamente." },
        500,
      );
    }

    if (!usedCode) {
      console.warn("[reset-password] no confirmed code in window", { email: normalizedEmail });
      return jsonResponse(
        {
          code: "code_expired",
          error: "O código expirou. Solicite um novo código e confirme novamente para trocar a senha.",
        },
        400,
      );
    }

    console.log("[reset-password] code confirmed, locating user", { email: normalizedEmail });

    const user = await findAuthUserByEmail(supabaseAdmin, normalizedEmail);

    if (!user) {
      console.warn("[reset-password] user not found", { email: normalizedEmail });
      // O código NÃO é apagado: se o e-mail estiver certo e a conta existir em
      // outro caminho, o usuário pode tentar novamente dentro da janela.
      return jsonResponse(
        {
          code: "user_not_found",
          error: "Este e-mail não possui cadastro. Faça um novo cadastro para acessar o aplicativo.",
        },
        404,
      );
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });

    if (updateError) {
      const classified = classifyUpdateError(updateError as { message?: string; code?: string; status?: number });
      console.error("[reset-password] update failed", {
        email: normalizedEmail,
        reason: classified.code,
        raw: updateError.message,
      });
      // Mantém o passe de redefinição válido para nova tentativa.
      return jsonResponse({ code: classified.code, error: classified.error }, classified.status);
    }

    // Só consome o código depois do sucesso real.
    await supabaseAdmin.from("verification_codes").delete().eq("email", normalizedEmail);

    console.log("[reset-password] password updated", { email: normalizedEmail });

    return jsonResponse({ success: true, message: "Senha atualizada com sucesso" });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[reset-password] unexpected error:", errorMessage);
    return jsonResponse(
      { code: "unexpected", error: "Não conseguimos alterar a senha agora. Tente novamente em instantes." },
      500,
    );
  }
});
