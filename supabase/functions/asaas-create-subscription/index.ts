// Cria (ou troca) a assinatura da conta no Asaas com CARTÃO de crédito/débito.
//
// Fluxo:
//  1) O usuário (admin da conta) escolhe plano (usuários) + ciclo e informa o
//     cartão. O cartão é enviado APENAS ao Asaas (tokenização no gateway): o
//     banco guarda somente bandeira e últimos 4 dígitos.
//  2) Se for o primeiro cartão, a assinatura nasce em TESTE GRATUITO de 20
//     dias — nextDueDate fica para o fim do teste, sem cobrança antes disso.
//  3) Se o teste já tiver sido usado, a cobrança acontece imediatamente.
//  4) Registra o método de pagamento (metadados) e uma notificação interna.
//
// Segurança: JWT obrigatório, admin da conta, preço validado no backend
// (tabela _shared/billingPlans.ts), cartão validado por Luhn antes do envio.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { asaasFetch, onlyDigits } from "../_shared/asaas.ts";
import { response } from "../_shared/response.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  BILLING_CYCLES,
  BILLING_PLANS,
  TRIAL_DAYS,
  cycleForMonths,
  detectCardBrand,
  luhnValid,
  planForSeats,
  quoteCycle,
} from "../_shared/billingPlans.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const DAY_MS = 24 * 60 * 60 * 1000;

interface CreateBody {
  seats?: unknown;
  billingMonths?: unknown;
  creditCard?: {
    holderName?: unknown;
    number?: unknown;
    expiryMonth?: unknown;
    expiryYear?: unknown;
    ccv?: unknown;
  };
  holderInfo?: {
    name?: unknown;
    email?: unknown;
    cpfCnpj?: unknown;
    postalCode?: unknown;
    addressNumber?: unknown;
    phone?: unknown;
  };
}

function isValidCpfCnpj(digits: string): boolean {
  return /^\d{11}$/.test(digits) || /^\d{14}$/.test(digits);
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// deno-lint-ignore no-explicit-any
type AnyClient = SupabaseClient<any>;

async function getCallerContext(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { error: response(401, { error: "unauthorized" }) };

  const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: { user }, error } = await caller.auth.getUser();
  if (error || !user) return { error: response(401, { error: "unauthorized" }) };
  return { caller, user };
}

async function listOpenPaymentLinks(ownerUserId: string) {
  const all: Array<{ id: string; active?: boolean; url?: string; description?: string | null }> = [];
  let offset = 0;
  for (let page = 0; page < 10; page += 1) {
    const batch = await asaasFetch<{ data?: Array<{ id: string; active?: boolean; url?: string; description?: string | null }>; hasMore?: boolean }>(
      `/paymentLinks?limit=100&offset=${offset}`,
    );
    const rows = batch.data ?? [];
    for (const row of rows) {
      if (row.description?.includes(ownerUserId)) all.push(row);
    }
    if (!batch.hasMore || rows.length === 0) break;
    offset += rows.length;
  }
  return all;
}

/** Remove cobranças antigas para a conta não continuar recebendo fatura do plano anterior. */
async function cleanupOldPaymentLinks(ownerUserId: string, keepDescription?: string) {
  try {
    const links = await listOpenPaymentLinks(ownerUserId);
    for (const link of links) {
      if (keepDescription && link.description === keepDescription) continue;
      try {
        await asaasFetch(`/paymentLinks/${link.id}`, { method: "DELETE" });
      } catch {
        /* link já inativo/removido */
      }
    }
  } catch (e) {
    console.warn("[asaas-create-subscription] cleanup payment links falhou:", e);
  }
}

async function reconcileSeatLimit(admin: AnyClient, ownerUserId: string, seats: number) {
  const { count, error } = await admin
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("account_owner_id", ownerUserId);
  if (error) {
    console.warn("[asaas-create-subscription] falha ao contar usuários:", error);
    return;
  }
  const activeUsers = count ?? 0;
  if (activeUsers > seats) {
    const { error: subError } = await admin
      .from("account_subscriptions")
      .update({ seat_limit: activeUsers })
      .eq("owner_user_id", ownerUserId)
      .lt("seat_limit", activeUsers);
    if (subError) console.warn("[asaas-create-subscription] correção de limite falhou:", subError);
  }
}

async function assertAccessIsLiberated(admin: AnyClient, ownerUserId: string) {
  const { data: roles, error: rolesError } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("account_owner_id", ownerUserId);
  if (rolesError) {
    console.warn("[asaas-create-subscription] falha ao listar usuários da conta:", rolesError);
    return;
  }
  const userIds = (roles ?? []).map((r) => r.user_id).filter(Boolean);
  if (userIds.length === 0) return;
  const { data: statuses, error: statusError } = await admin
    .from("profiles")
    .select("id, account_status")
    .in("id", userIds);
  if (statusError) {
    console.warn("[asaas-create-subscription] falha ao conferir perfis:", statusError);
    return;
  }
  const inactive = (statuses ?? []).filter((p) => p.account_status !== "active");
  if (inactive.length > 0) {
    console.error(
      `[asaas-create-subscription] ${inactive.length} usuário(s) seguem inativos após liberação (conta ${ownerUserId})`,
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ctx = await getCallerContext(req);
    if ("error" in ctx) return ctx.error;
    const { caller, user } = ctx;

    const body = (await req.json().catch(() => ({}))) as CreateBody;

    // Plano + ciclo validados contra a tabela do backend (preço nunca vem do cliente).
    const seats = Number(body.seats);
    const months = Number(body.billingMonths ?? 1);
    const plan = planForSeats(seats);
    const cycle = cycleForMonths(months);
    const quote = quoteCycle(seats, months);
    if (!plan || !cycle || !quote) {
      return response(400, {
        error: "invalid_plan",
        message: `Plano inválido. Usuários permitidos: ${BILLING_PLANS.map((p) => p.seats).join(", ")}; ciclos: ${BILLING_CYCLES.map((c) => c.months).join(", ")} meses.`,
      });
    }

    // ── Cartão obrigatório ────────────────────────────────────────────────
    const card = body.creditCard ?? {};
    const holder = body.holderInfo ?? {};
    const cardNumber = onlyDigits(text(card.number));
    const ccv = onlyDigits(text(card.ccv));
    const expiryMonth = text(card.expiryMonth);
    const expiryYear = text(card.expiryYear);
    const holderName = text(card.holderName);
    const holderCpfCnpj = onlyDigits(text(holder.cpfCnpj));
    const holderPostalCode = onlyDigits(text(holder.postalCode));
    const holderAddressNumber = text(holder.addressNumber);
    const holderPhone = onlyDigits(text(holder.phone));
    const holderEmail = text(holder.email) || (user.email ?? "");
    const holderFullName = text(holder.name) || holderName;

    const cardErrors: string[] = [];
    if (!holderName || holderName.length < 3) cardErrors.push("nome impresso no cartão");
    if (!luhnValid(cardNumber)) cardErrors.push("número do cartão");
    if (!/^\d{2}$/.test(expiryMonth) || Number(expiryMonth) < 1 || Number(expiryMonth) > 12) {
      cardErrors.push("mês de validade");
    }
    if (!/^\d{4}$/.test(expiryYear)) cardErrors.push("ano de validade");
    if (!/^\d{3,4}$/.test(ccv)) cardErrors.push("código de segurança");
    if (!isValidCpfCnpj(holderCpfCnpj)) cardErrors.push("CPF/CNPJ do titular");
    if (holderPostalCode.length !== 8) cardErrors.push("CEP do titular");
    if (!holderAddressNumber) cardErrors.push("número do endereço");
    if (cardErrors.length > 0) {
      return response(400, {
        error: "invalid_card",
        message: `Revise os dados: ${cardErrors.join(", ")}.`,
      });
    }

    const remoteIp = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "127.0.0.1";

    // ── Conta e permissões ────────────────────────────────────────────────
    const { data: subRow, error: subErr } = await caller.rpc("get_my_subscription");
    if (subErr) return response(500, { error: subErr.message });
    if (!subRow?.owner_user_id) return response(403, { error: "no_account" });
    if (subRow.owner_user_id !== user.id) return response(403, { error: "not_account_owner" });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("account_owner_id", subRow.owner_user_id)
      .maybeSingle();
    if (roleRow?.role !== "admin") return response(403, { error: "not_account_admin" });

    const isTrialEligible = subRow.status === "pending" && !subRow.trial_start_at && !subRow.asaas_subscription_id;

    // ── Cliente no Asaas (idempotente) ────────────────────────────────────
    let customerId: string | null = subRow.asaas_customer_id ?? null;
    const externalRef = `user:${subRow.owner_user_id}|seats:${seats}|months:${months}`;

    const userEmail = user.email ?? "";
    if (!customerId && userEmail) {
      const found = await asaasFetch<{ data?: Array<{ id: string }> }>(
        `/customers?email=${encodeURIComponent(userEmail)}&limit=1`,
      ).catch(() => ({ data: [] }));
      customerId = found.data?.[0]?.id ?? null;
    }
    if (!customerId) {
      const customer = await asaasFetch<{ id: string }>("/customers", {
        method: "POST",
        body: JSON.stringify({
          name: holderFullName,
          email: userEmail,
          cpfCnpj: holderCpfCnpj,
          mobilePhone: holderPhone || undefined,
          externalReference: externalRef,
          notificationDisabled: false,
        }),
      });
      customerId = customer.id;
    } else {
      await asaasFetch(`/customers/${customerId}`, {
        method: "PUT",
        body: JSON.stringify({ cpfCnpj: holderCpfCnpj, name: holderFullName, mobilePhone: holderPhone || undefined }),
      }).catch((e) => console.warn("[asaas-create-subscription] atualização do cliente falhou:", e));
    }

    // ── Período de teste: 20 dias a partir do primeiro cartão ─────────────
    const now = new Date();
    let trialStartAt: Date | null = null;
    let trialEndAt: Date | null = null;

    const stillTrialing =
      subRow.status === "trial" &&
      !!subRow.trial_ends_at &&
      new Date(subRow.trial_ends_at).getTime() > now.getTime();

    if (isTrialEligible) {
      trialStartAt = now;
      trialEndAt = new Date(now.getTime() + TRIAL_DAYS * DAY_MS);
    } else if (stillTrialing) {
      trialStartAt = subRow.trial_start_at ? new Date(subRow.trial_start_at) : null;
      trialEndAt = new Date(subRow.trial_ends_at);
    }

    const nextDueDate = (trialEndAt ?? now).toISOString().slice(0, 10);

    // ── Assinatura no Asaas com cartão (tokenização no gateway) ──────────
    const cycleDesc = cycle.label.toLowerCase();
    const description = trialEndAt
      ? `Hora Pro — plano ${seats} usuário(s) (${cycleDesc}) · teste grátis de ${TRIAL_DAYS} dias`
      : `Hora Pro — plano ${seats} usuário(s) (${cycleDesc})`;

    const subscriptionPayload: Record<string, unknown> = {
      customer: customerId,
      billingType: "CREDIT_CARD",
      value: quote.totalCents / 100,
      nextDueDate,
      cycle: cycle.asaasCycle,
      description,
      externalReference: externalRef,
      creditCard: {
        holderName,
        number: cardNumber,
        expiryMonth,
        expiryYear,
        ccv,
      },
      creditCardHolderInfo: {
        name: holderFullName,
        email: holderEmail,
        cpfCnpj: holderCpfCnpj,
        postalCode: holderPostalCode,
        addressNumber: holderAddressNumber,
        phone: holderPhone || undefined,
      },
      remoteIp,
    };

    let subscriptionId: string | null = subRow.asaas_subscription_id ?? null;
    if (subscriptionId) {
      await asaasFetch(`/subscriptions/${subscriptionId}`, {
        method: "PUT",
        body: JSON.stringify({
          value: quote.totalCents / 100,
          nextDueDate,
          cycle: cycle.asaasCycle,
          description,
          externalReference: externalRef,
          updatePendingPayments: true,
          creditCard: subscriptionPayload.creditCard,
          creditCardHolderInfo: subscriptionPayload.creditCardHolderInfo,
          remoteIp,
        }),
      });
    } else {
      const created = await asaasFetch<{ id: string }>("/subscriptions", {
        method: "POST",
        body: JSON.stringify(subscriptionPayload),
      });
      subscriptionId = created.id;
    }

    // Bandeira/últimos 4 a partir do primeiro pagamento gerado (metadados).
    let cardBrand = detectCardBrand(cardNumber);
    let cardLastFour = cardNumber.slice(-4);
    try {
      const firstPayment = await asaasFetch<{ data?: Array<{ creditCard?: { creditCardBrand?: string; creditCardNumber?: string } }> }>(
        `/subscriptions/${subscriptionId}/payments?limit=1`,
      );
      const cc = firstPayment.data?.[0]?.creditCard;
      if (cc?.creditCardBrand) cardBrand = String(cc.creditCardBrand).toLowerCase();
      if (cc?.creditCardNumber) cardLastFour = onlyDigits(cc.creditCardNumber).slice(-4) || cardLastFour;
    } catch {
      /* metadados locais já são suficientes */
    }

    // ── Método de pagamento da conta (somente metadados, nunca o cartão) ──
    try {
      await admin
        .from("account_payment_methods")
        .update({ is_default: false })
        .eq("owner_user_id", subRow.owner_user_id)
        .eq("is_default", true);
      await admin.from("account_payment_methods").insert({
        owner_user_id: subRow.owner_user_id,
        provider: "asaas",
        card_brand: cardBrand,
        card_last_four: cardLastFour,
        card_exp_month: Number(expiryMonth),
        card_exp_year: Number(expiryYear),
        holder_name: holderName,
        holder_document: holderCpfCnpj,
        is_default: true,
      });
    } catch (e) {
      console.warn("[asaas-create-subscription] registro do método de pagamento falhou:", e);
    }

    // ── Estado local da assinatura ────────────────────────────────────────
    const { error: upErr } = await admin
      .from("account_subscriptions")
      .update({
        asaas_customer_id: customerId,
        asaas_subscription_id: subscriptionId,
        status: trialEndAt ? "trial" : "pending",
        seat_limit: seats,
        seats,
        plan_tier: seats,
        price_monthly: quote.monthlyCents / 100,
        monthly_price: quote.monthlyCents / 100,
        billing_cycle: cycle.key,
        discount_percentage: quote.discountPercentage,
        final_price: quote.totalCents / 100,
        trial_start_at: trialStartAt ? trialStartAt.toISOString() : null,
        trial_ends_at: trialEndAt ? trialEndAt.toISOString() : null,
        current_period_start: (trialEndAt ?? now).toISOString(),
        current_period_end: (trialEndAt ?? now).toISOString(),
        next_billing_at: (trialEndAt ?? now).toISOString(),
        grace_ends_at: null,
        suspended_at: null,
        cancel_at_period_end: false,
        updated_at: new Date().toISOString(),
      })
      .eq("owner_user_id", subRow.owner_user_id);
    if (upErr) return response(500, { error: upErr.message });

    // ── Notificação interna ───────────────────────────────────────────────
    try {
      await admin.from("notifications").insert({
        owner_user_id: subRow.owner_user_id,
        user_id: subRow.owner_user_id,
        type: trialEndAt ? "trial_started" : "subscription_created",
        title: trialEndAt ? "Teste gratuito iniciado" : "Assinatura criada",
        message: trialEndAt
          ? `Seu teste gratuito de ${TRIAL_DAYS} dias começou. A primeira cobrança de R$ ${(quote.totalCents / 100).toFixed(2).replace(".", ",")} acontece em ${trialEndAt.toLocaleDateString("pt-BR")} no cartão ${cardBrand} •••• ${cardLastFour}.`
          : `Assinatura do plano de ${seats} usuário(s) criada. Cobrança de R$ ${(quote.totalCents / 100).toFixed(2).replace(".", ",")} em processamento no cartão ${cardBrand} •••• ${cardLastFour}.`,
        data: { seats, months, value: quote.totalCents / 100, card_brand: cardBrand, card_last_four: cardLastFour },
      });
    } catch (e) {
      console.warn("[asaas-create-subscription] notificação falhou:", e);
    }

    void reconcileSeatLimit(admin, subRow.owner_user_id, seats);
    void assertAccessIsLiberated(admin, subRow.owner_user_id);
    void cleanupOldPaymentLinks(subRow.owner_user_id);

    return response(200, {
      ok: true,
      status: trialEndAt ? "trial" : "pending",
      trialing: !!trialEndAt,
      trial_start_at: trialStartAt?.toISOString() ?? null,
      trial_ends_at: trialEndAt?.toISOString() ?? null,
      next_billing_at: (trialEndAt ?? now).toISOString(),
      seats,
      billing_cycle: cycle.key,
      value: quote.totalCents / 100,
      discount_percentage: quote.discountPercentage,
      card: { brand: cardBrand, last_four: cardLastFour },
    });
  } catch (e) {
    console.error("[asaas-create-subscription] erro:", e);
    const msg = e instanceof Error ? e.message : "unknown_error";
    const friendly = msg.startsWith("Asaas")
      ? "Não foi possível concluir com os dados informados. Revise o cartão e tente novamente."
      : msg;
    return response(500, { error: friendly });
  }
});
