// Super Admin actions: manual payment + extend trial.
// Only callable by users with the 'super_admin' role.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Body =
  | {
      action: "mark_paid";
      owner_user_id: string;
      months?: number; // default 1
      plan_tier?: number; // optional override
      seat_limit?: number;
    }
  | {
      action: "extend_trial";
      owner_user_id: string;
      extra_days: number;
    }
  | {
      action: "set_grandfathered";
      owner_user_id: string;
      value: boolean;
    };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller and check super_admin
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401);
    }
    const callerId = claimsData.claims.sub as string;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: isSuper, error: roleErr } = await admin.rpc("is_super_admin", {
      _user_id: callerId,
    });
    if (roleErr) return json({ error: roleErr.message }, 500);
    if (!isSuper) return json({ error: "forbidden: super_admin only" }, 403);

    const body = (await req.json()) as Body;
    if (!body?.action || !body?.owner_user_id) {
      return json({ error: "missing action or owner_user_id" }, 400);
    }

    // Ensure subscription row exists
    const { data: existing } = await admin
      .from("account_subscriptions")
      .select("*")
      .eq("owner_user_id", body.owner_user_id)
      .maybeSingle();

    if (!existing) {
      await admin.from("account_subscriptions").insert({
        owner_user_id: body.owner_user_id,
        status: "trial",
        trial_ends_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        seat_limit: 1,
      });
    }

    // Pre-fetch target user (email + display name) for notification
    const targetInfo = await getTargetUserInfo(admin, body.owner_user_id);

    if (body.action === "mark_paid") {
      const months = Math.max(1, Math.min(60, body.months ?? 1));
      const base = existing?.current_period_end
        ? new Date(existing.current_period_end as string)
        : new Date();
      const start = base.getTime() > Date.now() ? base : new Date();
      const end = new Date(start);
      end.setMonth(end.getMonth() + months);
      const patch: Record<string, unknown> = {
        status: "active",
        current_period_end: end.toISOString(),
      };
      if (typeof body.plan_tier === "number") patch.plan_tier = body.plan_tier;
      if (typeof body.seat_limit === "number") patch.seat_limit = body.seat_limit;

      const { error } = await admin
        .from("account_subscriptions")
        .update(patch)
        .eq("owner_user_id", body.owner_user_id);
      if (error) return json({ error: error.message }, 500);
      await logAudit(admin, callerId, "super_admin.mark_paid", body.owner_user_id, {
        months,
        new_period_end: end.toISOString(),
      });
      await sendNotificationEmail(targetInfo, {
        kind: "payment_recorded",
        months,
        validUntil: fmtDate(end),
      }, `super-admin-mark-paid-${body.owner_user_id}-${end.toISOString()}`);
      return json({ ok: true, current_period_end: end.toISOString() });
    }

    if (body.action === "extend_trial") {
      const extra = Math.max(1, Math.min(365, body.extra_days));
      const base = existing?.trial_ends_at
        ? new Date(existing.trial_ends_at as string)
        : new Date();
      const from = base.getTime() > Date.now() ? base : new Date();
      const newEnd = new Date(from.getTime() + extra * 86400000);
      const { error } = await admin
        .from("account_subscriptions")
        .update({ status: "trial", trial_ends_at: newEnd.toISOString() })
        .eq("owner_user_id", body.owner_user_id);
      if (error) return json({ error: error.message }, 500);
      await logAudit(admin, callerId, "super_admin.extend_trial", body.owner_user_id, {
        extra_days: extra,
        new_trial_ends_at: newEnd.toISOString(),
      });
      await sendNotificationEmail(targetInfo, {
        kind: "trial_extended",
        extraDays: extra,
        validUntil: fmtDate(newEnd),
      }, `super-admin-extend-trial-${body.owner_user_id}-${newEnd.toISOString()}`);
      return json({ ok: true, trial_ends_at: newEnd.toISOString() });
    }

    if (body.action === "set_grandfathered") {
      const { error } = await admin
        .from("account_subscriptions")
        .update({
          is_grandfathered: !!body.value,
          status: body.value ? "grandfathered" : "trial",
        })
        .eq("owner_user_id", body.owner_user_id);
      if (error) return json({ error: error.message }, 500);
      await logAudit(admin, callerId, "super_admin.set_grandfathered", body.owner_user_id, {
        value: !!body.value,
      });
      if (body.value) {
        await sendNotificationEmail(targetInfo, {
          kind: "lifetime_granted",
        }, `super-admin-lifetime-${body.owner_user_id}-${Date.now()}`);
      }
      return json({ ok: true });
    }


    return json({ error: "unknown action" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function logAudit(
  admin: ReturnType<typeof createClient>,
  actorId: string,
  action: string,
  targetUserId: string,
  details: Record<string, unknown>,
) {
  try {
    await admin.from("audit_log").insert({
      user_id: actorId,
      action,
      entity_type: "account_subscriptions",
      entity_id: targetUserId,
      details,
    });
  } catch (_e) {
    // Don't fail the action because of audit logging
  }
}
