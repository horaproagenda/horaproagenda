/**
 * Avisos antecipados por e-mail ao administrador da conta:
 *  - renovação da assinatura (mensal, semestral ou anual) em 7, 3 e 1 dia;
 *  - cobrança automática do fim do teste gratuito em 7, 3 e 1 dia;
 *  - fim do período de carência de pagamento recusado em 3 e 1 dia.
 *
 * Executado diariamente por cron (pg_cron). Cada aviso é idempotente por
 * conta + tipo + data limite + dias restantes.
 */
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret, x-cron-secret",
};


const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_DAYS = [7, 3, 1];
const GRACE_REMINDER_DAYS = [3, 1];
const PAYMENT_GRACE_DAYS = 5;

const log = (step: string, details?: unknown) =>
  console.log(`[SUB-REMINDERS] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

function brDate(ms: number): string {
  return new Date(ms).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function daysUntil(ms: number, now: number): number {
  if (ms <= now) return 0;
  return Math.max(1, Math.ceil((ms - now) / DAY_MS));
}

function cycleLabel(interval?: string | null, count?: number | null): string | undefined {
  const c = count && count > 0 ? count : 1;
  if (interval === "year" && c === 1) return "anual";
  if (interval === "month") {
    if (c === 1) return "mensal";
    if (c === 3) return "trimestral";
    if (c === 6) return "semestral";
    if (c === 12) return "anual";
  }
  return undefined;
}

function formatBrl(amountCents?: number | null, currency = "brl"): string | undefined {
  if (!amountCents || amountCents <= 0) return undefined;
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: (currency || "brl").toUpperCase(),
    }).format(amountCents / 100);
  } catch {
    return `R$ ${(amountCents / 100).toFixed(2).replace(".", ",")}`;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const internalSecret = Deno.env.get("INTERNAL_EMAIL_SECRET") ?? "";
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  const provided = req.headers.get("x-internal-secret") ?? "";
  const authorized = (serviceKey && token === serviceKey)
    || (internalSecret && provided === internalSecret);
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    serviceKey,
    { auth: { persistSession: false } },
  );

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" }) : null;
  const priceCache = new Map<string, { cycle?: string; amount?: string }>();

  const priceInfo = async (priceId: string | null) => {
    if (!priceId || !stripe) return {};
    if (priceCache.has(priceId)) return priceCache.get(priceId)!;
    try {
      const price = await stripe.prices.retrieve(priceId);
      const info = {
        cycle: cycleLabel(price.recurring?.interval, price.recurring?.interval_count),
        amount: formatBrl(price.unit_amount, price.currency),
      };
      priceCache.set(priceId, info);
      return info;
    } catch (e) {
      log("Falha ao ler preço no Stripe", { priceId, e: e instanceof Error ? e.message : String(e) });
      priceCache.set(priceId, {});
      return {};
    }
  };

  const sendEmail = async (
    ownerUserId: string,
    templateData: Record<string, unknown>,
    idempotencyKey: string,
  ) => {
    const { data: u } = await (supabase.auth as any).admin.getUserById(ownerUserId);
    const email = u?.user?.email as string | undefined;
    if (!email) {
      log("Administrador sem e-mail, aviso ignorado", { ownerUserId });
      return false;
    }
    const name = (u?.user?.user_metadata?.full_name as string | undefined)
      ?? (u?.user?.user_metadata?.name as string | undefined)
      ?? email.split("@")[0];
    const { error } = await supabase.functions.invoke("send-transactional-email", {
      headers: { "x-internal-secret": internalSecret },
      body: {
        templateName: "account-status-update",
        recipientEmail: email,
        idempotencyKey,
        templateData: { name, isAdmin: true, ...templateData },
      },
    });
    if (error) {
      log("Falha no envio", { ownerUserId, idempotencyKey, error: error.message });
      return false;
    }
    return true;
  };

  try {
    const now = Date.now();
    const { data: subs, error } = await supabase
      .from("account_subscriptions")
      .select("owner_user_id, status, is_grandfathered, trial_ends_at, current_period_end, stripe_price_id")
      .in("status", ["trial", "active", "past_due", "canceled"]);
    if (error) throw error;

    let sent = 0;
    for (const sub of subs ?? []) {
      if (sub.is_grandfathered) continue;
      const owner = sub.owner_user_id as string;

      // ── Carência de pagamento recusado ───────────────────────────
      if (sub.status === "past_due" || sub.status === "canceled") {
        const refRaw = sub.current_period_end ?? sub.trial_ends_at;
        const refMs = refRaw ? new Date(refRaw).getTime() : NaN;
        if (!Number.isFinite(refMs)) continue;
        const graceEnds = Math.min(refMs, now) + PAYMENT_GRACE_DAYS * DAY_MS;
        const left = daysUntil(graceEnds, now);
        if (!GRACE_REMINDER_DAYS.includes(left)) continue;
        const ok = await sendEmail(
          owner,
          { kind: "grace_ending_reminder", daysLeft: left, dueDate: brDate(graceEnds) },
          `grace-reminder-${owner}-${new Date(graceEnds).toISOString().slice(0, 10)}-${left}`,
        );
        if (ok) sent++;
        continue;
      }

      // ── Fim do teste gratuito ────────────────────────────────────
      if (sub.status === "trial") {
        const ms = sub.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : NaN;
        if (!Number.isFinite(ms) || ms <= now) continue;
        const left = daysUntil(ms, now);
        if (!REMINDER_DAYS.includes(left)) continue;
        const info = await priceInfo(sub.stripe_price_id);
        const ok = await sendEmail(
          owner,
          {
            kind: "trial_charge_reminder",
            daysLeft: left,
            dueDate: brDate(ms),
            cycleLabel: info.cycle,
            amount: info.amount,
          },
          `trial-reminder-${owner}-${new Date(ms).toISOString().slice(0, 10)}-${left}`,
        );
        if (ok) sent++;
        continue;
      }

      // ── Renovação da assinatura (mensal/semestral/anual) ─────────
      const ms = sub.current_period_end ? new Date(sub.current_period_end).getTime() : NaN;
      if (!Number.isFinite(ms) || ms <= now) continue;
      const left = daysUntil(ms, now);
      if (!REMINDER_DAYS.includes(left)) continue;
      const info = await priceInfo(sub.stripe_price_id);
      const ok = await sendEmail(
        owner,
        {
          kind: "renewal_reminder",
          daysLeft: left,
          dueDate: brDate(ms),
          cycleLabel: info.cycle,
          amount: info.amount,
        },
        `renewal-reminder-${owner}-${new Date(ms).toISOString().slice(0, 10)}-${left}`,
      );
      if (ok) sent++;
    }

    log("Concluído", { total: subs?.length ?? 0, sent });
    return new Response(JSON.stringify({ success: true, checked: subs?.length ?? 0, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("ERRO", { msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
