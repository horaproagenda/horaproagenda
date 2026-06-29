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
  code?: string;
  phone?: string;
  cpf?: string;
  companyName?: string;
  cnpj?: string;
  city?: string;
  state?: string;
  selectedPlan?: string;
  // Dados da clínica (passam direto para business_settings)
  clinicName?: string;
  clinicPhone?: string;
  clinicEmail?: string;
  // Endereço estruturado da clínica
  clinicCep?: string;
  clinicStreet?: string;
  clinicNumber?: string;
  clinicComplement?: string;
  clinicNeighborhood?: string;
  clinicCity?: string;
  clinicState?: string;
}

// CPF validator (matches src/lib/cpfValidator.ts)
function isValidCPF(input: string): boolean {
  const cpf = (input || "").replace(/\D/g, "");
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
  let r = (sum * 10) % 11; if (r >= 10) r = 0;
  if (r !== parseInt(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
  r = (sum * 10) % 11; if (r >= 10) r = 0;
  return r === parseInt(cpf[10]);
}

function normalizePhone(input: string): string | null {
  const d = (input || "").replace(/\D/g, "");
  if (!d) return null;
  if ((input || "").trim().startsWith("+") && d.length >= 11) return "+" + d;
  if (d.length === 10 || d.length === 11) return "+55" + d;
  if (d.length === 12 || d.length === 13) return "+" + d;
  return null;
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
  const { data: trial } = await supabaseAdmin
    .from("trial_registrations")
    .select("user_id, email")
    .eq("email", normalizedEmail)
    .not("user_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (trial?.user_id) return { id: trial.user_id, email: trial.email };

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .eq("email", normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (profile?.id) return { id: profile.id, email: profile.email };

  const perPage = 1000;
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
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
    const { email, password, fullName, code, phone, cpf, companyName, cnpj, city, state, selectedPlan }: CompleteSignupRequest = await req.json();
    const normalizedEmail = email?.trim().toLowerCase();
    const normalizedCode = (code ?? "").toString().replace(/\D/g, "").trim();

    if (!normalizedEmail || !password || !fullName?.trim()) {
      return jsonResponse({ success: false, error: "Nome, e-mail e senha são obrigatórios." }, 400);
    }

    if (password.length < 6) {
      return jsonResponse({ success: false, error: "A senha deve ter pelo menos 6 caracteres." }, 400);
    }

    // CPF mandatory + valid
    const cpfDigits = (cpf || "").replace(/\D/g, "");
    if (!cpfDigits || !isValidCPF(cpfDigits)) {
      return jsonResponse({ success: false, error: "CPF inválido. Verifique e tente novamente." }, 400);
    }

    // Phone is optional
    const phoneE164 = phone ? normalizePhone(phone) : null;
    if (phone && !phoneE164) {
      return jsonResponse({ success: false, error: "Número de celular inválido." }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Block accounts whose identifiers were cancelled/blocked previously
    {
      const { data: blockCheck } = await supabaseAdmin.rpc("is_identifier_blocked", {
        p_email: normalizedEmail,
        p_cpf: cpfDigits,
        p_cnpj: cnpj ?? null,
        p_phone: phoneE164 ?? null,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((blockCheck as any)?.blocked) {
        return jsonResponse({
          success: false,
          code: "account_blocked",
          error: "Este cadastro está bloqueado pela administração da plataforma. Entre em contato com o suporte para mais informações.",
        }, 403);
      }
    }

    // Validate verification code atomically (accepts either a freshly-used code
    // within the last 10 min OR an active code passed in `code`).
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    let verifiedCodeId: string | null = null;
    {
      const { data: usedCode } = await supabaseAdmin
        .from("verification_codes")
        .select("id")
        .eq("email", normalizedEmail)
        .eq("type", "signup")
        .not("used_at", "is", null)
        .gte("used_at", tenMinutesAgo)
        .order("used_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (usedCode) {
        verifiedCodeId = usedCode.id;
      } else if (normalizedCode.length === 6) {
        // Fallback: match by code value across ANY unused signup code for this
        // email (not just the latest). This avoids "Código inválido" when a
        // delayed email or a resend race left more than one active code in the
        // table — any matching, unexpired code is accepted.
        const { data: matching } = await supabaseAdmin
          .from("verification_codes")
          .select("*")
          .eq("email", normalizedEmail)
          .eq("type", "signup")
          .eq("code", normalizedCode)
          .is("used_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (matching) {
          if (new Date(matching.expires_at).getTime() < Date.now()) {
            await supabaseAdmin.from("verification_codes").delete().eq("id", matching.id);
            return jsonResponse({ success: false, error: "Código expirado. Solicite um novo." }, 400);
          }
          verifiedCodeId = matching.id;
        } else {
          const { data: anyActive } = await supabaseAdmin
            .from("verification_codes")
            .select("id, attempts, expires_at")
            .eq("email", normalizedEmail)
            .eq("type", "signup")
            .is("used_at", null)
            .gte("expires_at", new Date().toISOString())
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!anyActive) {
            return jsonResponse({ success: false, error: "Nenhum código ativo. Solicite um novo código." }, 400);
          }
          await supabaseAdmin
            .from("verification_codes")
            .update({ attempts: (anyActive.attempts ?? 0) + 1 })
            .eq("id", anyActive.id);
          return jsonResponse({ success: false, error: "Código inválido." }, 400);
        }
      } else {
        return jsonResponse({ success: false, error: "E-mail não verificado. Solicite um novo código." }, 400);
      }
    }


    // Phone code is optional — only verified when phone is provided
    if (phoneE164) {
      const { data: usedPhoneCode } = await supabaseAdmin
        .from("phone_verification_codes")
        .select("id")
        .eq("phone", phoneE164)
        .not("used_at", "is", null)
        .gte("used_at", tenMinutesAgo)
        .limit(1)
        .maybeSingle();
      if (!usedPhoneCode) {
        return jsonResponse({ success: false, error: "Celular não verificado. Solicite um novo código por SMS." }, 400);
      }
    }

    // Block duplicate CPF across registrations — but allow the SAME email to
    // retry (idempotent recovery from a previous attempt that created the
    // trial_registrations row and/or the auth user but failed to log in).
    const { data: cpfDup } = await supabaseAdmin
      .from("trial_registrations")
      .select("id, email")
      .eq("cpf", cpfDigits)
      .maybeSingle();
    if (cpfDup && (cpfDup.email ?? "").toLowerCase() !== normalizedEmail) {
      return jsonResponse({ success: false, error: "Este CPF já possui cadastro." }, 409);
    }


    const userMetadata = {
      full_name: fullName.trim(),
      phone: phoneE164,
      cpf: cpfDigits,
      company_name: companyName || null,
      cnpj: cnpj || null,
      city: city || null,
      state: state || null,
      selected_plan: selectedPlan || null,
    };

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
    });

    let userId: string | null = created?.user?.id ?? null;

    if (createError) {
      const message = createError.message?.toLowerCase() || "";
      if (
        message.includes("already") ||
        message.includes("registered") ||
        message.includes("exists") ||
        (createError as any)?.code === "email_exists"
      ) {
        const existingUser = await findAuthUserByEmail(supabaseAdmin, normalizedEmail);
        const { data: existingTrial } = await supabaseAdmin
          .from("trial_registrations")
          .select("email, cpf, user_id")
          .eq("email", normalizedEmail)
          .limit(1)
          .maybeSingle();

        if (existingUser?.id && existingTrial?.cpf === cpfDigits) {
          userId = existingUser.id;
        } else {
          return jsonResponse(
            {
              success: false,
              code: "email_exists",
              error:
                "Este e-mail já está cadastrado. Faça login com sua senha ou use a opção 'Esqueci minha senha' para recuperá-la.",
            },
            409,
          );
        }
      }
      if (!userId) {
        console.error("complete-signup create user error:", createError);
        return jsonResponse({ success: false, error: createError.message || "Erro ao criar usuário." }, 500);
      }
    }

    if (!userId) {
      return jsonResponse({ success: false, error: "Erro ao criar usuário." }, 500);
    }

    // Mark the verification code as used ONLY after we successfully created
    // the user. This prevents the code from being burned if user creation
    // failed for any reason (so the user can retry without requesting a new
    // code).
    if (verifiedCodeId) {
      await supabaseAdmin
        .from("verification_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("id", verifiedCodeId)
        .is("used_at", null);
    }


    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      full_name: fullName.trim(),
      email: normalizedEmail,
      phone: phoneE164,
    });
    if (profileError) console.error("complete-signup profile upsert error:", profileError);

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
    if (roleError) {
      console.error("complete-signup role upsert error:", roleError);
      return jsonResponse({ success: false, error: "Erro ao configurar permissões da conta." }, 500);
    }

    const nowIso = new Date().toISOString();
    await supabaseAdmin.from("trial_registrations").upsert({
      email: normalizedEmail,
      phone: phoneE164,
      cpf: cpfDigits,
      full_name: fullName.trim(),
      company_name: companyName || null,
      cnpj: cnpj || null,
      city: city || null,
      state: state || null,
      user_id: userId,
      subscription_status: "trial",
      trial_started_at: nowIso,
      trial_ended_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      email_verified_at: nowIso,
      phone_verified_at: phoneE164 ? nowIso : null,
    }, { onConflict: "email" });

    await supabaseAdmin.from("verification_codes").delete().eq("email", normalizedEmail);
    if (phoneE164) {
      await supabaseAdmin.from("phone_verification_codes").delete().eq("phone", phoneE164);
    }

    return jsonResponse({ success: true, user_id: userId });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("complete-signup error:", errorMessage);
    return jsonResponse({ success: false, error: errorMessage }, 500);
  }
});
