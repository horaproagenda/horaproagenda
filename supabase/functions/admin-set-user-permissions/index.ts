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
    const { data: isAdmin } = await supaAdmin.rpc("has_role", { _user_id: callerId, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Apenas administradores." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, permissions } = await req.json();
    if (!user_id || !Array.isArray(permissions)) {
      return new Response(JSON.stringify({ error: "user_id e permissions obrigatórios." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Tenant isolation
    const { data: callerProfile } = await supaAdmin
      .from("profiles").select("account_owner_id").eq("id", callerId).maybeSingle();
    const ownerId = callerProfile?.account_owner_id ?? callerId;
    const { data: targetProfile } = await supaAdmin
      .from("profiles").select("account_owner_id").eq("id", user_id).maybeSingle();
    if (!targetProfile || (targetProfile.account_owner_id ?? user_id) !== ownerId) {
      return new Response(JSON.stringify({ error: "Acesso negado" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ALLOWED_SCOPES = ["own", "shared", "unit", "all"];
    type PermInput = Record<string, unknown>;
    const rows = permissions.map((p: PermInput) => ({
      user_id,
      module: String(p.module),
      can_view: !!p.can_view,
      can_create: !!p.can_create,
      can_edit: !!p.can_edit,
      can_delete: !!p.can_delete,
      can_edit_others: !!p.can_edit_others,
      can_delete_others: !!p.can_delete_others,
      can_export: !!p.can_export,
      can_print: !!p.can_print,
      can_view_values: !!p.can_view_values,
      can_view_others: !!p.can_view_others,
      can_share: !!p.can_share,
      data_scope: ALLOWED_SCOPES.includes(String(p.data_scope)) ? String(p.data_scope) : "own",
    }));


    const { error } = await supaAdmin.from("user_permissions").upsert(rows, { onConflict: "user_id,module" });
    if (error) throw error;

    return new Response(JSON.stringify({ success: true, count: rows.length }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
