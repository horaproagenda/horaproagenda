import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: claims, error: cErr } = await supabaseAuth.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (cErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);

    const userId = claims.claims.sub as string;
    const userEmail = (claims.claims.email as string | undefined) ?? null;

    const body = await req.json().catch(() => ({}));
    const confirmation: string = String(body?.confirmation ?? "").trim();
    if (confirmation.toUpperCase() !== "EXCLUIR MINHA CONTA") {
      return json({ error: 'Confirmação inválida. Digite exatamente "EXCLUIR MINHA CONTA".' }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Buscar dados do cadastro para gravar o bloqueio (hashes)
    const { data: reg } = await admin
      .from("trial_registrations")
      .select("email, phone, cpf, cnpj, has_paid")
      .eq("user_id", userId)
      .maybeSingle();

    const email = (reg?.email ?? userEmail ?? "").toLowerCase().trim();
    const phoneDigits = (reg?.phone ?? "").replace(/\D/g, "");
    const cpfDigits = (reg?.cpf ?? "").replace(/\D/g, "");
    const cnpjDigits = (reg?.cnpj ?? "").replace(/\D/g, "");

    // Gerar hashes via função SQL (sha256)
    const hashOne = async (value: string) => {
      if (!value) return null;
      const { data } = await admin.rpc("hash_identifier", { _value: value });
      return (data as string | null) ?? null;
    };

    const [emailHash, phoneHash, cpfHash, cnpjHash] = await Promise.all([
      hashOne(email),
      hashOne(phoneDigits),
      hashOne(cpfDigits),
      hashOne(cnpjDigits),
    ]);

    // Registrar bloqueio (6 meses) ANTES de excluir
    const { error: blockError } = await admin.from("deleted_account_blocklist").insert({
      email_hash: emailHash,
      phone_hash: phoneHash,
      cpf_hash: cpfHash,
      cnpj_hash: cnpjHash,
      had_paid: Boolean(reg?.has_paid),
      reason: "self_deletion",
    });
    if (blockError) {
      console.error("delete-my-account block error:", blockError);
      return json({ error: "Não foi possível registrar o bloqueio. Tente novamente." }, 500);
    }

    // Tabelas espelho (a maioria dos dados é apagada em cascata pelas FKs)
    await admin.from("trial_registrations").delete().eq("user_id", userId);
    await admin.from("user_roles").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("id", userId);

    // Excluir usuário do Auth (dispara cascata por user_id em várias tabelas)
    const { error: delError } = await admin.auth.admin.deleteUser(userId);
    if (delError) {
      console.error("delete-my-account auth delete error:", delError);
      return json({ error: delError.message || "Erro ao excluir usuário." }, 500);
    }

    return json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("delete-my-account error:", msg);
    return json({ error: msg }, 500);
  }
});
