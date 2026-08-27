// Webhook do Asaas — libera/bloqueia o acesso ao aplicativo em tempo real.
//
// URL a cadastrar no painel do Asaas:
//   https://<project-ref>.supabase.co/functions/v1/asaas-webhook
// Autenticação: cabeçalho `asaas-access-token` igual ao segredo
// ASAAS_WEBHOOK_TOKEN (campo "Token de autenticação" no painel do Asaas).
//
// Garantias:
//  - Idempotente: cada aviso é registrado em payment_webhook_events
//    (gateway_event_id único) e nunca processado duas vezes.
//  - Registra a cobrança em public.payments (rastreabilidade).
//  - Notifica o administrador no app (public.notifications, realtime) e por
//    e-mail (template account-status-update).
//  - Aplica a carência de 2 dias corridos: passado o prazo, suspende a conta
//    (varredura suspend_overdue_subscriptions) sem apagar nenhum dado.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders as baseCorsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  asaasFetch,
  MONTHS_BY_CYCLE,
  parseExternalReference,
} from "../_shared/asaas.ts";
import { GRACE_DAYS } from "../_shared/billingPlans.ts";

const corsHeaders = {
  ...baseCorsHeaders,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, asaas-access-token, x-asaas-access-token, access-token",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

function cleanToken(value?: string | null): string {
  return (value ?? "").replace(/^Bearer\s+/i, "").trim();
}

function tokenCandidates(req: Request): string[] {
  return [
    req.headers.get("asaas-access-token"),
    req.headers.get("x-asaas-access-token"),
    req.headers.get("access-token"),
    req.headers.get("Authorization"),
  ]
    .map(cleanToken)
    .filter((value) => value.length > 0);
}

function tokensMatch(expected: string, received: string): boolean {
  if (expected.length === 0 || received.length === 0) return false;
  if (expected.length !== received.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  }
  return diff === 0;
}

function isAuthorizedAsaasWebhook(req: Request): { ok: boolean; reason?: string } {
  const expected = cleanToken(Deno.env.get("ASAAS_WEBHOOK_TOKEN"));
  if (!expected) return { ok: false, reason: "missing_secret" };
  const candidates = tokenCandidates(req);
  if (candidates.length === 0) return { ok: false, reason: "missing_token" };
  if (!candidates.some((candidate) => tokensMatch(expected, candidate))) {
    return { ok: false, reason: "token_mismatch" };
  }
  return { ok: true };
}

/** Eventos que liberam o acesso. */
const PAID_EVENTS = new Set([
  "PAYMENT_RECEIVED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED_IN_CASH",
]);

/** Eventos que colocam a conta em atraso (carência de 2 dias). */
const OVERDUE_EVENTS = new Set(["PAYMENT_OVERDUE", "PAYMENT_DUNNING_REQUESTED"]);

/** Eventos que encerram o acesso pago. */
const CANCEL_EVENTS = new Set([
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_REVERSED",
  "PAYMENT_DELETED",
  "SUBSCRIPTION_DELETED",
]);

/** Status da cobrança em public.payments por tipo de evento. */
const PAYMENT_STATUS_BY_EVENT: Record<string, string> = {
  PAYMENT_CREATED: "pending",
  PAYMENT_UPDATED: "pending",
  PAYMENT_AWAITING_RISK_ANALYSIS: "pending",
  PAYMENT_RECEIVED: "paid",
  PAYMENT_CONFIRMED: "paid",
  PAYMENT_RECEIVED_IN_CASH: "paid",
  PAYMENT_OVERDUE: "overdue",
  PAYMENT_DUNNING_REQUESTED: "overdue",
  PAYMENT_REFUNDED: "refunded",
  PAYMENT_REVERSED: "refunded",
  PAYMENT_CHARGEBACK_REQUESTED: "chargeback",
  PAYMENT_CHARGEBACK_DISPUTE: "chargeback",
  PAYMENT_DELETED: "cancelled",
};

const DAY_MS = 24 * 60 * 60 * 1000;

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

// deno-lint-ignore no-explicit-any
type AnyClient = SupabaseClient<any>;

async function sha256Hex(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function formatBRL(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function formatDateBR(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** E-mail transacional ao administrador (best-effort: nunca derruba o webhook). */
async function sendStatusEmail(
  ownerUserId: string,
  kind: string,
  templateData: Record<string, unknown>,
  idempotencyKey: string,
) {
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const { data: userData } = await admin.auth.admin.getUserById(ownerUserId);
    const email = userData?.user?.email;
    if (!email) return;
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": Deno.env.get("INTERNAL_EMAIL_SECRET") ?? "",
      },
      body: JSON.stringify({
        templateName: "account-status-update",
        recipientEmail: email,
        idempotencyKey,
        templateData: {
          kind,
          name: (userData.user.user_metadata?.full_name as string) ?? undefined,
          isAdmin: true,
          ...templateData,
        },
      }),
    });
    await res.text(); // consome o corpo (evita vazamento de recurso no Deno)
  } catch (e) {
    console.warn("[asaas-webhook] e-mail não enviado:", e);
  }
}

async function notifyOwner(
  admin: AnyClient,
  ownerUserId: string,
  type: string,
  title: string,
  message: string,
  data?: Record<string, unknown>,
) {
  try {
    await admin.from("notifications").insert({
      owner_user_id: ownerUserId,
      user_id: ownerUserId,
      type,
      title,
      message,
      data: data ?? {},
    });
  } catch (e) {
    console.warn("[asaas-webhook] notificação interna falhou:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = isAuthorizedAsaasWebhook(req);
  if (!auth.ok) {
    console.warn("[asaas-webhook] acesso negado", { reason: auth.reason });
    if (auth.reason === "missing_secret") {
      return json({ error: "webhook_not_configured" }, 500);
    }
    return json({ error: "unauthorized" }, 401);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const rawBody = await req.text();
  let loggedEventId: string | null = null;

  try {
    const body = JSON.parse(rawBody);
    const eventType: string = body?.event ?? "unknown";
    const eventId: string = body?.id ?? `${eventType}:${body?.payment?.id ?? crypto.randomUUID()}`;
    loggedEventId = eventId;
    console.log("[asaas-webhook] evento", { eventType, eventId });

    // Idempotência: o mesmo aviso nunca é processado duas vezes.
    const payloadHash = await sha256Hex(rawBody);
    const { error: dupErr } = await admin
      .from("payment_webhook_events")
      .insert({
        gateway_event_id: eventId,
        event_type: eventType,
        payload_hash: payloadHash,
        gateway: "asaas",
      });
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
      await admin
        .from("payment_webhook_events")
        .update({ processed: true, processed_at: new Date().toISOString(), error_message: "conta não identificada" })
        .eq("gateway_event_id", eventId);
      return json({ received: true, matched: false });
    }

    // Estado anterior (para saber se houve suspensão/reativação).
    const { data: before } = await admin
      .from("account_subscriptions")
      .select("id, status, seat_limit, final_price")
      .eq("owner_user_id", ownerUserId)
      .maybeSingle();

    // 2) Rastreabilidade da cobrança.
    const paymentStatus = PAYMENT_STATUS_BY_EVENT[eventType] ?? null;
    if (payment.id && paymentStatus) {
      const paidAt = PAID_EVENTS.has(eventType)
        ? new Date(payment.confirmedDate ?? payment.paymentDate ?? Date.now()).toISOString()
        : null;
      try {
        await admin.from("payments").upsert({
          owner_user_id: ownerUserId,
          gateway_payment_id: payment.id,
          billing_cycle: months ? `${months}m` : null,
          plan_users: ref.seats ?? before?.seat_limit ?? null,
          amount: payment.value ?? 0,
          final_amount: payment.value ?? null,
          status: paymentStatus,
          due_at: payment.dueDate ? new Date(`${payment.dueDate}T12:00:00Z`).toISOString() : null,
          paid_at: paidAt,
          failed_at: OVERDUE_EVENTS.has(eventType) ? new Date().toISOString() : null,
          provider: "asaas",
          updated_at: new Date().toISOString(),
        }, { onConflict: "gateway_payment_id" });
      } catch (e) {
        console.warn("[asaas-webhook] registro da cobrança falhou:", e);
      }
    }

    // 3) Atualiza a assinatura da conta.
    const patch: Record<string, unknown> = {
      payment_provider: "asaas",
      updated_at: new Date().toISOString(),
      ...(payment.customer ? { asaas_customer_id: payment.customer } : {}),
      ...(subscriptionId ? { asaas_subscription_id: subscriptionId } : {}),
      ...(payment.id ? { asaas_payment_id: payment.id } : {}),
    };

    const amountLabel = payment.value != null ? formatBRL(payment.value) : null;

    if (PAID_EVENTS.has(eventType)) {
      const paidAt = new Date(payment.confirmedDate ?? payment.paymentDate ?? Date.now());
      const cycleMonths = months ?? 1;
      const end = new Date(paidAt.getTime());
      end.setMonth(end.getMonth() + cycleMonths);
      patch.status = "active";
      patch.current_period_end = end.toISOString();
      patch.next_billing_at = end.toISOString();
      patch.grace_ends_at = null;
      patch.suspended_at = null;
      const wasBlocked = ["suspended", "past_due", "overdue", "failed"].includes(before?.status ?? "");
      if (wasBlocked) patch.reactivated_at = new Date().toISOString();
      if (ref.seats) {
        patch.seat_limit = ref.seats;
        patch.plan_tier = ref.seats;
      }
      console.log("[asaas-webhook] acesso liberado", {
        ownerUserId, cycleMonths, seats: ref.seats, end: end.toISOString(),
      });

      await notifyOwner(
        admin,
        ownerUserId,
        "payment_succeeded",
        wasBlocked ? "Acesso restaurado" : "Pagamento confirmado",
        wasBlocked
          ? `Recebemos seu pagamento${amountLabel ? ` de ${amountLabel}` : ""} e o acesso de todos os usuários da conta foi reativado automaticamente.`
          : `Recebemos seu pagamento${amountLabel ? ` de ${amountLabel}` : ""}. Sua assinatura segue ativa até ${formatDateBR(end)}.`,
        { payment_id: payment.id, value: payment.value },
      );
      void sendStatusEmail(
        ownerUserId,
        "subscription_activated",
        { validUntil: formatDateBR(end), months: cycleMonths, planLabel: ref.seats ? `${ref.seats} usuário(s)` : undefined },
        `paid-${payment.id ?? eventId}`,
      );
    } else if (OVERDUE_EVENTS.has(eventType)) {
      // Falha na cobrança: carência de 2 dias corridos a partir do vencimento.
      const failedAt = payment.dueDate ? new Date(`${payment.dueDate}T12:00:00Z`) : new Date();
      const graceEnd = new Date(failedAt.getTime() + GRACE_DAYS * DAY_MS);
      patch.status = "past_due";
      patch.grace_ends_at = graceEnd.toISOString();

      await notifyOwner(
        admin,
        ownerUserId,
        "payment_failed",
        "Pagamento não confirmado",
        `A cobrança${amountLabel ? ` de ${amountLabel}` : ""} não foi confirmada. Você tem ${GRACE_DAYS} dias corridos de tolerância (até ${formatDateBR(graceEnd)}) para atualizar o cartão. Depois disso, o acesso da conta será suspenso — sem perda de dados.`,
        { payment_id: payment.id, value: payment.value, grace_ends_at: graceEnd.toISOString() },
      );
      void sendStatusEmail(
        ownerUserId,
        "payment_failed",
        { amount: amountLabel ?? undefined, graceDays: GRACE_DAYS, graceDeadline: formatDateBR(graceEnd) },
        `overdue-${payment.id ?? eventId}`,
      );
    } else if (CANCEL_EVENTS.has(eventType)) {
      patch.status = "canceled";
      patch.canceled_at = new Date().toISOString();
      patch.grace_ends_at = null;

      await notifyOwner(
        admin,
        ownerUserId,
        "subscription_canceled",
        "Assinatura encerrada",
        `Sua assinatura foi encerrada${eventType.includes("CHARGEBACK") ? " após contestação do pagamento" : eventType.includes("REFUND") || eventType.includes("REVERSED") ? " e o valor foi estornado" : ""}. Para voltar a usar o aplicativo, assine novamente na tela de planos.`,
        { payment_id: payment.id, event: eventType },
      );
      void sendStatusEmail(ownerUserId, "access_suspended", { reason: "Assinatura encerrada." }, `cancel-${payment.id ?? eventId}`);
    } else {
      console.log("[asaas-webhook] evento informativo", { eventType });
    }

    if (before?.id) {
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
          status: (patch.status as string) ?? "pending",
          seat_limit: (patch.seat_limit as number) ?? 1,
          ...patch,
        });
      if (error) throw new Error(error.message);
    }

    // 4) Varredura de carência: suspende contas que passaram dos 2 dias.
    let suspendedNow = false;
    try {
      await admin.rpc("suspend_overdue_subscriptions");
      if (OVERDUE_EVENTS.has(eventType)) {
        const { data: after } = await admin
          .from("account_subscriptions")
          .select("status")
          .eq("owner_user_id", ownerUserId)
          .maybeSingle();
        suspendedNow = after?.status === "suspended" && before?.status !== "suspended";
      }
    } catch (e) {
      console.warn("[asaas-webhook] varredura de suspensão falhou:", e);
    }

    if (suspendedNow) {
      await notifyOwner(
        admin,
        ownerUserId,
        "access_suspended",
        "Acesso suspenso",
        "O prazo de tolerância após a falha no pagamento terminou e o acesso da conta foi suspenso. Nenhum dado foi apagado: atualize o pagamento para reativar tudo automaticamente.",
        { event: eventType },
      );
      void sendStatusEmail(ownerUserId, "access_suspended", {}, `suspended-${eventId}`);
    }

    await admin
      .from("payment_webhook_events")
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq("gateway_event_id", eventId);

    return json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[asaas-webhook] erro:", message);
    if (loggedEventId) {
      try {
        await admin
          .from("payment_webhook_events")
          .update({ error_message: message.slice(0, 500), processed_at: new Date().toISOString() })
          .eq("gateway_event_id", loggedEventId);
      } catch { /* best-effort */ }
    }
    // 200 evita reentrega infinita de um evento que já registramos; o log
    // mostra a falha e o app revalida pelo asaas-check-subscription.
    return json({ received: true, error: message });
  }
});
