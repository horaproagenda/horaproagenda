// Webhook do Asaas — libera/bloqueia o acesso ao aplicativo em tempo real.
//
// URL a cadastrar no painel do Asaas:
//   https://<project-ref>.supabase.co/functions/v1/asaas-webhook
// Autenticação: cabeçalho `asaas-access-token` igual ao segredo
// ASAAS_WEBHOOK_TOKEN (campo "Token de autenticação" no painel do Asaas).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  asaasFetch,
  MONTHS_BY_CYCLE,
  parseExternalReference,
} from "../_shared/asaas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, asaas-access-token",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

/** Eventos que liberam o acesso. */
const PAID_EVENTS = new Set([
  "PAYMENT_RECEIVED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED_IN_CASH",
]);

/** Eventos que colocam a conta em atraso (mantém os avisos/tolerância atuais). */
const OVERDUE_EVENTS = new Set(["PAYMENT_OVERDUE", "PAYMENT_DUNNING_REQUESTED"]);

/** Eventos que encerram o acesso pago. */
const CANCEL_EVENTS = new Set([
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_REVERSED",
  "PAYMENT_DELETED",
  "SUBSCRIPTION_DELETED",
]);

interface AsaasPayment {
  id?: string;
  customer?: string;
  subscription?: string;
  value?: number;
  externalReference?: string | null;
  dueDate?: string;
  confirmedDate?: string;
  paymentDate?: string;
  description?: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const expected = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
  const received = req.headers.get("asaas-access-token");
  if (!expected || received !== expected) {
    console.warn("[asaas-webhook] token inválido");
    return json({ error: "unauthorized" }, 401);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const body = await req.json();
    const eventType: string = body?.event ?? "unknown";
    const eventId: string = body?.id ?? `${eventType}:${body?.payment?.id ?? crypto.randomUUID()}`;
    console.log("[asaas-webhook] evento", { eventType, eventId });

    // Idempotência: o mesmo aviso nunca é processado duas vezes.
    const { error: dupErr } = await admin
      .from("processed_asaas_events")
      .insert({ event_id: eventId, event_type: eventType, payload: body });
    if (dupErr) {
      if (dupErr.code === "23505" || dupErr.message?.includes("duplicate key")) {
        console.log("[asaas-webhook] evento repetido, ignorado", { eventId });
        return json({ received: true, duplicated: true });
      }
      console.error("[asaas-webhook] falha ao registrar evento:", dupErr.message);
    }

    const payment: AsaasPayment = body?.payment ?? {};
    const subscriptionId = payment.subscription ?? body?.subscription?.id ?? null;

    // 1) Quem é o dono da conta: externalReference da cobrança, da assinatura,
    //    ou o registro já vinculado ao cliente/assinatura do Asaas.
    let ref = parseExternalReference(
      payment.externalReference ?? body?.subscription?.externalReference ?? null,
    );

    let months = ref.months ?? null;
    if (!ref.userId && subscriptionId) {
      try {
        const sub = await asaasFetch<{
          externalReference?: string | null;
          cycle?: string;
        }>(`/subscriptions/${subscriptionId}`);
        const subRef = parseExternalReference(sub.externalReference);
        ref = { ...ref, ...Object.fromEntries(Object.entries(subRef).filter(([, v]) => v != null)) };
        if (!months && sub.cycle) months = MONTHS_BY_CYCLE[sub.cycle] ?? null;
      } catch (e) {
        console.warn("[asaas-webhook] não foi possível ler a assinatura:", e);
      }
    }

    let ownerUserId = ref.userId;
    if (!ownerUserId) {
      const orFilters = [
        subscriptionId ? `asaas_subscription_id.eq.${subscriptionId}` : null,
        payment.customer ? `asaas_customer_id.eq.${payment.customer}` : null,
      ].filter(Boolean).join(",");
      if (orFilters) {
        const { data } = await admin
          .from("account_subscriptions")
          .select("owner_user_id")
          .or(orFilters)
          .maybeSingle();
        ownerUserId = data?.owner_user_id ?? null;
      }
    }

    if (!ownerUserId) {
      console.warn("[asaas-webhook] evento sem conta identificada", { eventType, eventId });
      return json({ received: true, matched: false });
    }

    const patch: Record<string, unknown> = {
      payment_provider: "asaas",
      ...(payment.customer ? { asaas_customer_id: payment.customer } : {}),
      ...(subscriptionId ? { asaas_subscription_id: subscriptionId } : {}),
      ...(payment.id ? { asaas_payment_id: payment.id } : {}),
    };

    if (PAID_EVENTS.has(eventType)) {
      const paidAt = new Date(
        payment.confirmedDate ?? payment.paymentDate ?? Date.now(),
      );
      const cycleMonths = months ?? 1;
      const end = new Date(paidAt.getTime());
      end.setMonth(end.getMonth() + cycleMonths);
      patch.status = "active";
      patch.current_period_end = end.toISOString();
      if (ref.seats) {
        patch.seat_limit = ref.seats;
        patch.plan_tier = ref.seats;
      }
      console.log("[asaas-webhook] acesso liberado", {
        ownerUserId, cycleMonths, seats: ref.seats, end: end.toISOString(),
      });
    } else if (OVERDUE_EVENTS.has(eventType)) {
      patch.status = "past_due";
    } else if (CANCEL_EVENTS.has(eventType)) {
      patch.status = "canceled";
    } else {
      // Eventos informativos (criado, atualizado, etc.): só guarda os vínculos.
      console.log("[asaas-webhook] evento informativo", { eventType });
    }

    const { data: existing } = await admin
      .from("account_subscriptions")
      .select("id")
      .eq("owner_user_id", ownerUserId)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await admin
        .from("account_subscriptions")
        .update(patch)
        .eq("owner_user_id", ownerUserId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin
        .from("account_subscriptions")
        .insert({
          owner_user_id: ownerUserId,
          status: (patch.status as string) ?? "trial",
          seat_limit: (patch.seat_limit as number) ?? 1,
          ...patch,
        });
      if (error) throw new Error(error.message);
    }

    return json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[asaas-webhook] erro:", message);
    // 200 evita reentrega infinita de um evento que já registramos; o log
    // mostra a falha e o app revalida pelo asaas-check-subscription.
    return json({ received: true, error: message });
  }
});
