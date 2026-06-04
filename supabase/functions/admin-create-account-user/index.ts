import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supaUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const supaAdmin = createClient(url, service, { auth: { persistSession: false } });

    const { data: claims } = await supaUser.auth.getClaims(authHeader.replace("Bearer ", ""));
    const callerId = claims?.claims?.sub as string | undefined;
    if (!callerId) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verifica admin
    const { data: isAdmin } = await supaAdmin.rpc("has_role", { _user_id: callerId, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem criar usuários." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { email, password, full_name, permissions, must_change_password } = body as {
      email: string;
      password: string;
      full_name: string;
      permissions: Array<{ module: string; can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }>;
      must_change_password?: boolean;
    };

    if (!email || !password || password.length < 8 || !full_name) {
      return new Response(JSON.stringify({ error: "Email, nome e senha (mín. 8) são obrigatórios." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verifica limite de assentos
    const { data: sub } = await supaAdmin
      .from("account_subscriptions")
      .select("seat_limit, status, trial_ends_at, is_grandfathered")
      .eq("owner_user_id", callerId)
      .maybeSingle();

    if (!sub) {
      return new Response(JSON.stringify({ error: "Assinatura não encontrada." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: seatsUsed } = await supaAdmin.rpc("count_account_seats", { _owner: callerId });
    if (!sub.is_grandfathered && sub.status !== "grandfathered") {
      if ((seatsUsed as number) >= sub.seat_limit) {
        // Notifica o titular da conta por e-mail (best-effort)
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: ownerData } = await (supaAdmin.auth as any).admin.getUserById(callerId);
          const ownerEmail = ownerData?.user?.email;
          if (ownerEmail) {
            await supaAdmin.functions.invoke('send-transactional-email', {
              body: {
                templateName: 'account-status-update',
                recipientEmail: ownerEmail,
                idempotencyKey: `seats-blocked-${callerId}-${sub.seat_limit}-${Date.now()}`,
                templateData: {
                  kind: 'seats_blocked',
                  name: ownerData?.user?.user_metadata?.full_name,
                  used: seatsUsed,
                  seatLimit: sub.seat_limit,
                  attemptedEmail: email,
                },
              },
            });
          }
        } catch (_) { /* silencioso */ }
        return new Response(JSON.stringify({
          error: `Limite de ${sub.seat_limit} usuário(s) atingido. Faça upgrade do plano para adicionar mais.`,
          code: "seat_limit_reached",
        }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Cria usuário
    const { data: created, error: createErr } = await supaAdmin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name },
    });
    if (createErr || !created.user) {
      const msg = createErr?.message ?? "Erro ao criar usuário.";
      const isDup = /already|exists|registered/i.test(msg);
      return new Response(JSON.stringify({ error: isDup ? "Este e-mail já está cadastrado." : msg }), {
        status: isDup ? 409 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const newUserId = created.user.id;

    // Atualiza profile com vínculo de conta
    await supaAdmin.from("profiles").update({
      account_owner_id: callerId,
      must_change_password: !!must_change_password,
      is_active: true,
      full_name,
    }).eq("id", newUserId);

    // Insere role 'professional' por padrão (não admin)
    await supaAdmin.from("user_roles").insert({ user_id: newUserId, role: "professional" }).select();

    // Insere permissões
    if (Array.isArray(permissions) && permissions.length > 0) {
      const rows = permissions.map(p => ({
        user_id: newUserId,
        module: p.module,
        can_view: !!p.can_view,
        can_create: !!p.can_create,
        can_edit: !!p.can_edit,
        can_delete: !!p.can_delete,
      }));
      await supaAdmin.from("user_permissions").upsert(rows, { onConflict: "user_id,module" });
    }

    return new Response(JSON.stringify({ success: true, user_id: newUserId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
