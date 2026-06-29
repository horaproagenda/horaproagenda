import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

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

    // Resolve usuário pelo token
    const { data: userData, error: userErr } = await admin.auth.getUser(
      authHeader.replace(/^Bearer\s+/i, ""),
    );
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida." }), {
        status: 401, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const user = userData.user;
    const currentEmail = (user.email ?? "").trim().toLowerCase();
    if (!currentEmail) {
      return new Response(JSON.stringify({ error: "Conta sem e-mail cadastrado." }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const body = await req.json().catch(() => ({}));
    const type = body.type === "phone" ? "phone" : "email";
    const rawNewValue = String(body.newValue ?? "").trim();
    if (!rawNewValue) {
      return new Response(JSON.stringify({ error: "Informe o novo valor." }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    let newValue = rawNewValue;
    if (type === "email") {
      newValue = newValue.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newValue)) {
        return new Response(JSON.stringify({ error: "E-mail inválido." }), {
          status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      if (newValue === currentEmail) {
        return new Response(JSON.stringify({ error: "O novo e-mail é igual ao atual." }), {
          status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    } else {
      const phone = normalizePhone(newValue);
      if (!phone) {
        return new Response(JSON.stringify({ error: "Celular inválido." }), {
          status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      newValue = phone;
    }

    // Cooldown 60s por usuário e tipo
    const sixtySecAgo = new Date(Date.now() - 60_000).toISOString();
    const { data: recent } = await admin
      .from("contact_change_verifications")
      .select("id")
      .eq("user_id", user.id)
      .eq("type", type)
      .gte("created_at", sixtySecAgo)
      .limit(1)
      .maybeSingle();
    if (recent) {
      return new Response(JSON.stringify({ error: "Aguarde 60 segundos antes de pedir um novo código." }), {
        status: 429, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Limite 5/h por usuário e tipo
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await admin
      .from("contact_change_verifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("type", type)
      .gte("created_at", oneHourAgo);
    if ((count ?? 0) >= 5) {
      return new Response(JSON.stringify({ error: "Muitas tentativas. Tente novamente em 1 hora." }), {
        status: 429, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

    const { data: inserted, error: insertErr } = await admin
      .from("contact_change_verifications")
      .insert({ user_id: user.id, type, new_value: newValue, code, expires_at: expiresAt })
      .select("id")
      .single();
    if (insertErr) {
      return new Response(JSON.stringify({ error: "Erro ao registrar código." }), {
        status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Envia para o e-mail ATUAL via send-transactional-email
    const PUBLISHABLE_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zZ2NsbHJic3dvZGpvYWR5YnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NTQ5NjcsImV4cCI6MjA4MDUzMDk2N30.i7myc9A0jsBRAf4ehukJoMgl-79_GJrklch3D5_prXE";
    const sendResp = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PUBLISHABLE_JWT}`,
        apikey: PUBLISHABLE_JWT,
      },
      body: JSON.stringify({
        templateName: "contact-change-code",
        recipientEmail: currentEmail,
        idempotencyKey: `contact-change-${type}-${inserted.id}`,
        templateData: { code, type, newValue },
      }),
    });

    if (!sendResp.ok) {
      const errText = await sendResp.text().catch(() => "");
      await admin.from("contact_change_verifications").delete().eq("id", inserted.id);
      console.error("contact-change send error:", sendResp.status, errText);
      return new Response(JSON.stringify({ error: "Erro ao enviar e-mail." }), {
        status: 502, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ success: true, sentTo: currentEmail }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    console.error("send-contact-change-code error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Erro inesperado." }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
