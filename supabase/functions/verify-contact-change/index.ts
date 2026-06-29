import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(input: string): string | null {
  const d = (input || "").replace(/\D/g, "");
  if (!d) return null;
  if ((input || "").trim().startsWith("+") && d.length >= 11) return "+" + d;
  if (d.length === 10 || d.length === 11) return "+55" + d;
  if (d.length === 12 || d.length === 13) return "+" + d;
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado." }), {
        status: 401, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const { data: userData, error: userErr } = await admin.auth.getUser(
      authHeader.replace(/^Bearer\s+/i, ""),
    );
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida." }), {
        status: 401, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const type: 'email' | 'phone' = body.type === "phone" ? "phone" : "email";
    const rawNewValue = String(body.newValue ?? "").trim();
    const code = String(body.code ?? "").replace(/\D/g, "").trim();

    if (!rawNewValue || code.length !== 6) {
      return new Response(JSON.stringify({ error: "Dados incompletos." }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    let newValue = rawNewValue;
    if (type === "email") {
      newValue = newValue.toLowerCase();
    } else {
      const phone = normalizePhone(newValue);
      if (!phone) {
        return new Response(JSON.stringify({ error: "Celular inválido." }), {
          status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      newValue = phone;
    }

    // Busca código ativo
    const { data: row } = await admin
      .from("contact_change_verifications")
      .select("id, code, attempts, expires_at, used_at, new_value")
      .eq("user_id", user.id)
      .eq("type", type)
      .eq("new_value", newValue)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row) {
      return new Response(JSON.stringify({ error: "Nenhum código ativo. Solicite um novo." }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: "Código expirado. Solicite um novo." }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    if ((row.attempts ?? 0) >= 5) {
      return new Response(JSON.stringify({ error: "Muitas tentativas. Solicite um novo código." }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    if (row.code !== code) {
      await admin.from("contact_change_verifications")
        .update({ attempts: (row.attempts ?? 0) + 1 })
        .eq("id", row.id);
      return new Response(JSON.stringify({ error: "Código inválido." }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Aplica a alteração
    if (type === "email") {
      const { error: updErr } = await admin.auth.admin.updateUserById(user.id, { email: newValue });
      if (updErr) {
        return new Response(JSON.stringify({ error: updErr.message || "Erro ao atualizar e-mail." }), {
          status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      await admin.from("profiles").update({ email: newValue }).eq("id", user.id);
    } else {
      await admin.from("profiles").update({ phone: newValue }).eq("id", user.id);
    }

    await admin.from("contact_change_verifications")
      .update({ used_at: new Date().toISOString() })
      .eq("id", row.id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    console.error("verify-contact-change error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Erro inesperado." }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
