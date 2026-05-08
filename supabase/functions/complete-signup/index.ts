import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CompleteSignupRequest {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  companyName?: string;
  cnpj?: string;
  selectedPlan?: string;
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
    const { email, password, fullName, phone, companyName, cnpj, selectedPlan }: CompleteSignupRequest = await req.json();
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail || !password || !fullName?.trim()) {
      return jsonResponse({ success: false, error: "Nome, e-mail e senha são obrigatórios." }, 400);
    }

    if (password.length < 6) {
      return jsonResponse({ success: false, error: "A senha deve ter pelo menos 6 caracteres." }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: usedCode, error: codeError } = await supabaseAdmin
      .from("verification_codes")
      .select("id")
      .eq("email", normalizedEmail)
      .eq("type", "signup")
      .not("used_at", "is", null)
      .gte("used_at", fiveMinutesAgo)
      .limit(1)
      .maybeSingle();

    if (codeError) {
      console.error("complete-signup verification lookup error:", codeError);
      return jsonResponse({ success: false, error: "Erro ao validar o código verificado." }, 500);
    }

    if (!usedCode) {
      return jsonResponse({ success: false, error: "Código de verificação não encontrado ou expirado. Solicite um novo código." }, 400);
    }

    const userMetadata = {
      full_name: fullName.trim(),
      phone: phone || null,
      company_name: companyName || null,
      cnpj: cnpj || null,
      selected_plan: selectedPlan || null,
    };

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
    });

    let userId = created.user?.id ?? null;

    if (createError) {
      const message = createError.message?.toLowerCase() || "";
      if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
        const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (listError) {
          console.error("complete-signup list users error:", listError);
          return jsonResponse({ success: false, error: "Erro ao localizar usuário existente." }, 500);
        }

        const existingUser = users.users.find((user) => user.email?.toLowerCase() === normalizedEmail);
        if (!existingUser) {
          return jsonResponse({ success: false, error: "Este e-mail já está cadastrado. Use sua senha original para entrar." }, 409);
        }

        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
          password,
          email_confirm: true,
          user_metadata: userMetadata,
        });

        if (updateError) {
          console.error("complete-signup update existing user error:", updateError);
          return jsonResponse({ success: false, error: "Erro ao ativar usuário existente." }, 500);
        }

        userId = existingUser.id;
      } else {
        console.error("complete-signup create user error:", createError);
        return jsonResponse({ success: false, error: createError.message || "Erro ao criar usuário." }, 500);
      }
    }

    if (!userId) {
      return jsonResponse({ success: false, error: "Erro ao criar usuário." }, 500);
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      full_name: fullName.trim(),
      email: normalizedEmail,
      phone: phone || null,
    });
    if (profileError) console.error("complete-signup profile upsert error:", profileError);

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
    if (roleError) {
      console.error("complete-signup role upsert error:", roleError);
      return jsonResponse({ success: false, error: "Erro ao configurar permissões da conta." }, 500);
    }

    await supabaseAdmin
      .from("trial_registrations")
      .update({ user_id: userId, subscription_status: "trial" })
      .eq("email", normalizedEmail);

    await supabaseAdmin
      .from("verification_codes")
      .delete()
      .eq("email", normalizedEmail);

    return jsonResponse({ success: true, user_id: userId });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("complete-signup error:", errorMessage);
    return jsonResponse({ success: false, error: errorMessage }, 500);
  }
});
