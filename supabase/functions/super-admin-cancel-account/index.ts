// Super Admin: cancel an account permanently and register a blocklist entry
// so the same e-mail / CPF / CNPJ / phone cannot create a new account for 6 months
// (or until the entry is removed via Super Admin).
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [u, d] = email.split("@");
  if (!d) return email;
  const head = u.slice(0, 2);
  return `${head}${"*".repeat(Math.max(1, u.length - 2))}@${d}`;
}
function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  if (d.length < 4) return "***";
  return `${d.slice(0, 2)}****${d.slice(-2)}`;
}
function last4(value: string | null): string | null {
  if (!value) return null;
  const d = value.replace(/\D/g, "");
  return d ? d.slice(-4) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsErr || !claimsData?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const callerId = claimsData.claims.sub as string;

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: callerId });
    if (!isSuper) return json({ error: "forbidden: super_admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const ownerUserId: string | undefined = body?.owner_user_id;
    const reason: string = (body?.reason ?? "super_admin_cancellation").toString();
    const skipBlocklist: boolean = body?.skip_blocklist === true;
    const blockMonths: number = skipBlocklist
      ? 0
      : Math.max(1, Math.min(120, Number(body?.block_months ?? 6)));
    const purgeData: boolean = body?.purge_data !== false; // default true

    if (!ownerUserId) return json({ error: "owner_user_id is required" }, 400);

    // Gather identifying info from trial + auth + profile
    const [{ data: reg }, { data: prof }, { data: authUser }] = await Promise.all([
      admin.from("trial_registrations")
        .select("email, phone, cpf, cnpj, full_name, has_paid")
        .eq("user_id", ownerUserId).maybeSingle(),
      admin.from("profiles").select("email, full_name, phone").eq("id", ownerUserId).maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin.auth as any).admin.getUserById(ownerUserId),
    ]);

    const email = (reg?.email ?? prof?.email ?? authUser?.user?.email ?? "").toLowerCase().trim();
    const phoneDigits = ((reg?.phone ?? prof?.phone ?? "") || "").replace(/\D/g, "");
    const cpfDigits = ((reg?.cpf ?? "") || "").replace(/\D/g, "");
    const cnpjDigits = ((reg?.cnpj ?? "") || "").replace(/\D/g, "");
    const fullName = (reg?.full_name ?? prof?.full_name ?? "").trim();

    const hashOne = async (value: string) => {
      if (!value) return null;
      const { data } = await admin.rpc("hash_identifier", { _value: value });
      return (data as string | null) ?? null;
    };

    const [emailHash, phoneHash, cpfHash, cnpjHash, nameHash] = await Promise.all([
      hashOne(email),
      hashOne(phoneDigits),
      hashOne(cpfDigits),
      hashOne(cnpjDigits),
      hashOne(fullName.toLowerCase()),
    ]);

    const blockedUntil = skipBlocklist
      ? null
      : new Date(Date.now() + blockMonths * 30 * 86400000).toISOString();

    if (!skipBlocklist) {
      const { error: blockErr } = await admin.from("deleted_account_blocklist").insert({
        user_id: ownerUserId,
        email_hash: emailHash,
        phone_hash: phoneHash,
        cpf_hash: cpfHash,
        cnpj_hash: cnpjHash,
        full_name_hash: nameHash,
        email_masked: maskEmail(email || null),
        phone_masked: maskPhone(phoneDigits || null),
        cpf_last4: last4(cpfDigits),
        cnpj_last4: last4(cnpjDigits),
        had_paid: Boolean(reg?.has_paid),
        reason,
        cancellation_type: "super_admin_cancellation",
        canceled_by: callerId,
        blocked_until: blockedUntil,
      });
      if (blockErr) {
        console.error("super-admin-cancel-account block error:", blockErr);
        return json({ error: blockErr.message }, 500);
      }
    }

    // Mark subscription as canceled (if exists)
    await admin
      .from("account_subscriptions")
      .update({ status: "canceled", is_grandfathered: false })
      .eq("owner_user_id", ownerUserId);

    // Soft-disable the profile so realtime guards log the user out
    await admin.from("profiles").update({ is_active: false }).eq("id", ownerUserId);

    let purgeReport: unknown = null;
    const authDeleteWarnings: string[] = [];

    if (purgeData) {
      // 1. Collect child users (sub-profiles) BEFORE purging
      const { data: childRows } = await admin
        .from("profiles")
        .select("id")
        .eq("account_owner_id", ownerUserId)
        .neq("id", ownerUserId);
      const childIds: string[] = (childRows ?? [])
        .map((r) => r.id as string)
        .filter(Boolean);

      // 2. Wipe ALL tenant data via SECURITY DEFINER RPC (dynamic over every
      //    public table that has account_owner_id). Idempotent and tolerant of
      //    partial prior deletions.
      const { data: rpcRes, error: rpcErr } = await admin.rpc(
        "super_admin_purge_owner_data",
        { _owner_user_id: ownerUserId },
      );
      if (rpcErr) {
        console.error("super-admin-cancel-account purge rpc error:", rpcErr);
        return json({ error: `purge failed: ${rpcErr.message}` }, 500);
      }
      purgeReport = rpcRes;

      // 3. Delete auth users (children first, then the owner). Each failure is
      //    logged but does not abort the response — the DB is already clean.
      for (const childId of childIds) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: childErr } = await (admin.auth as any).admin.deleteUser(childId);
        if (childErr && !/not.found/i.test(childErr.message ?? "")) {
          authDeleteWarnings.push(`child ${childId}: ${childErr.message}`);
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: delErr } = await (admin.auth as any).admin.deleteUser(ownerUserId);
      if (delErr && !/not.found/i.test(delErr.message ?? "")) {
        console.error("super-admin-cancel-account auth delete:", delErr);
        authDeleteWarnings.push(`owner: ${delErr.message}`);
      }
    }

    await admin.from("audit_log").insert({
      user_id: callerId,
      action: skipBlocklist ? "super_admin.delete_account" : "super_admin.cancel_account",
      entity_type: "account_subscriptions",
      entity_id: ownerUserId,
      details: {
        reason,
        block_months: blockMonths,
        purge_data: purgeData,
        skip_blocklist: skipBlocklist,
        blocked_until: blockedUntil,
        purge_report: purgeReport,
        auth_delete_warnings: authDeleteWarnings,
      },
    });

    return json({
      ok: true,
      blocked_until: blockedUntil,
      purge_report: purgeReport,
      auth_delete_warnings: authDeleteWarnings,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("super-admin-cancel-account error:", msg);
    return json({ error: msg }, 500);
  }
});
