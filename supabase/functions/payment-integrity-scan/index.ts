// Varre assinaturas ativas e cancela acesso quando detecta inconsistência
// no Stripe: chargebacks (disputes), refunds, assinaturas canceladas/past_due
// ou clientes sem pagamento confirmado. Executável sob demanda (super_admin)
// ou por cron externo (usar header x-cron-secret = CRON_SECRET).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2025-08-27.basil",
});

const log = (s: string, d?: unknown) =>
  console.log(`[PAY-INTEGRITY] ${s}${d ? ` - ${JSON.stringify(d)}` : ""}`);

async function isSuperAdmin(token: string): Promise<boolean> {
  const { data: u } = await supabase.auth.getUser(token);
  if (!u?.user) return false;
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", u.user.id);
  return !!roles?.some((r: { role: string }) => r.role === "super_admin");
}

async function revoke(ownerId: string, reason: string, meta: Record<string, unknown>) {
  await supabase
    .from("account_subscriptions")
    .update({ status: "canceled", current_period_end: new Date().toISOString() })
    .eq("owner_user_id", ownerId);
  await supabase.from("audit_log").insert({
    action: "access_revoked_integrity_scan",
    table_name: "account_subscriptions",
    record_id: ownerId,
    new_data: { reason, ...meta },
  });
  log("Revoked", { ownerId, reason });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const cronSecret = Deno.env.get("CRON_SECRET");
    const providedCron = req.headers.get("x-cron-secret");
    const auth = req.headers.get("Authorization");
    let authorized = false;
    if (cronSecret && providedCron && providedCron === cronSecret) authorized = true;
    else if (auth?.startsWith("Bearer ")) {
      authorized = await isSuperAdmin(auth.replace("Bearer ", ""));
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: subs } = await supabase
      .from("account_subscriptions")
      .select("owner_user_id, stripe_customer_id, stripe_subscription_id, status, current_period_end")
      .in("status", ["active", "trial", "past_due"]);

    const findings: Array<Record<string, unknown>> = [];
    let revoked = 0;

    for (const s of subs ?? []) {
      const ownerId = s.owner_user_id as string;
      const customerId = s.stripe_customer_id as string | null;

      // 1) Sem customer no Stripe e não é grandfathered → inconsistente
      if (!customerId) {
        findings.push({ ownerId, issue: "no_stripe_customer" });
        continue; // não revoga; pode ser cortesia manual (grandfathered tratado à parte)
      }

      // 2) Disputas abertas
      const disputes = await stripe.disputes.list({ limit: 10 });
      const custDisputes = disputes.data.filter((d) => {
        const c = typeof d.charge === "string" ? null : d.charge?.customer;
        return c === customerId || (d as unknown as { customer?: string }).customer === customerId;
      });
      // Fallback melhor: buscar via charges
      const charges = await stripe.charges.list({ customer: customerId, limit: 20 });
      const disputed = charges.data.some((c) => c.disputed);
      const refunded = charges.data.some((c) => c.refunded || (c.amount_refunded ?? 0) > 0);

      if (disputed || custDisputes.length > 0) {
        await revoke(ownerId, "dispute_detected", { customerId });
        revoked++;
        continue;
      }
      if (refunded) {
        await revoke(ownerId, "refund_detected", { customerId });
        revoked++;
        continue;
      }

      // 3) Assinatura recorrente cancelada/past_due no Stripe
      if (s.stripe_subscription_id) {
        try {
          const sub = await stripe.subscriptions.retrieve(s.stripe_subscription_id as string);
          if (["canceled", "unpaid", "incomplete_expired"].includes(sub.status)) {
            await revoke(ownerId, `stripe_sub_${sub.status}`, { customerId, subId: sub.id });
            revoked++;
            continue;
          }
        } catch (e) {
          log("sub retrieve failed", { ownerId, e: e instanceof Error ? e.message : String(e) });
        }
      }

      // 4) Nenhuma cobrança bem-sucedida
      const hasPaid = charges.data.some((c) => c.paid && c.status === "succeeded");
      if (!hasPaid) {
        findings.push({ ownerId, issue: "no_successful_charge", customerId });
      }
    }

    return new Response(
      JSON.stringify({ scanned: subs?.length ?? 0, revoked, findings }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("error", { msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
