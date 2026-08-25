// Atualiza o cartão da assinatura no Asaas e tenta novamente a cobrança aberta.
//
// Usado quando a cobrança falha (cartão recusado/vencido): o administrador
// informa um novo cartão, que é tokenizado pelo Asaas; depois tentamos
// liquidar a fatura mais antiga em aberto (vencida ou pendente). O banco
// guarda apenas bandeira e últimos 4 dígitos — nunca o cartão.
//
// Segurança: JWT obrigatório + admin da conta; preço/limites nunca vêm daqui.

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { asaasFetch, onlyDigits } from "../_shared/asaas.ts";
import { response } from "../_shared/responses.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { detectCardBrand, luhnValid } from "../_shared/billingPlans.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const PAID_STATUSES = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isValidCpfCnpj(digits: string): boolean {
  return /^\d{11}$/.test(digits) || /^\d{14}$/.test(digits);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return response(401, { error: "unauthorized" });

    const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: authErr } = await caller.auth.getUser();
    if (authErr || !user) return response(401, { error: "unauthorized" });

    const body = await req.json().catch(() => ({}));
    const card = body?.creditCard ?? {};
    const holder = body?.holderInfo ?? {};

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
    if (!/^\d{2}$/.test(expiryMonth) || Number(expiryMonth) < 1 || Number(expiryMonth) > 12) cardErrors.push("mês de validade");
    if (!/^\d{4}$/.test(expiryYear)) cardErrors.push("ano de validade");
    if (!/^\d{3,4}$/.test(ccv)) cardErrors.push("código de segurança");
    if (!isValidCpfCnpj(holderCpfCnpj)) cardErrors.push("CPF/CNPJ do titular");
    if (holderPostalCode.length !== 8) cardErrors.push("CEP do titular");
    if (!holderAddressNumber) cardErrors.push("número do endereço");
    if (cardErrors.length > 0) {
      return response(400, { error: "invalid_card", message: `Revise os dados: ${cardErrors.join(", ")}.` });
    }

    const { data: subRow, error: subErr } = await caller.rpc("get_my_subscription");
    if (subErr) return response(500, { error: subErr.message });
    if (!subRow?.owner_user_id) return response(403, { error: "no_account" });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("account_owner_id", subRow.owner_user_id)
      .maybeSingle();
    if (roleRow?.role !== "admin") return response(403, { error: "not_account_admin" });

    if (!subRow.asaas_subscription_id) {
      return response(400, { error: "no_subscription", message: "Nenhuma assinatura encontrada para esta conta." });
    }

    const remoteIp = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "127.0.0.1";

    const creditCard = {
      holderName,
      number: cardNumber,
      expiryMonth,
      expiryYear,
      ccv,
    };
    const creditCardHolderInfo = {
      name: holderFullName,
      email: holderEmail,
      cpfCnpj: holderCpfCnpj,
      postalCode: holderPostalCode,
      addressNumber: holderAddressNumber,
      phone: holderPhone || undefined,
    };

    // 1) Troca o cartão da assinatura (tokenização no gateway).
    await asaasFetch(`/subscriptions/${subRow.asaas_subscription_id}/creditCard`, {
      method: "PUT",
      body: JSON.stringify({ creditCard, creditCardHolderInfo, remoteIp }),
    });

    // 2) Registra os metadados do novo método de pagamento.
    const cardBrand = detectCardBrand(cardNumber);
    const cardLastFour = cardNumber.slice(-4);
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
      console.warn("[asaas-update-card] registro do método falhou:", e);
    }

    // 3) Tenta liquidar a cobrança em aberto mais antiga (vencida, depois pendente).
    let retriedPayment: { id: string; status: string } | null = null;
    for (const status of ["OVERDUE", "PENDING"]) {
      const open = await asaasFetch<{ data?: Array<{ id: string; status: string; dueDate?: string }> }>(
        `/subscriptions/${subRow.asaas_subscription_id}/payments?status=${status}&limit=1`,
      ).catch(() => ({ data: [] }));
      const payment = (open.data ?? []).sort((a, b) =>
        new Date(a.dueDate ?? 0).getTime() - new Date(b.dueDate ?? 0).getTime()
      )[0];
      if (payment) {
        const charged = await asaasFetch<{ id: string; status: string }>(
          `/payments/${payment.id}/payWithCreditCard`,
          { method: "POST", body: JSON.stringify({ creditCard, creditCardHolderInfo, remoteIp }) },
        );
        retriedPayment = charged;
        break;
      }
    }

    // 4) Se o pagamento foi aprovado na hora, libera o acesso imediatamente.
    let accessRestored = false;
    if (retriedPayment && PAID_STATUSES.has(retriedPayment.status)) {
      accessRestored = true;
      const nowIso = new Date().toISOString();
      const wasBlocked = ["suspended", "past_due", "overdue", "failed"].includes(subRow.status ?? "");
      await admin
        .from("account_subscriptions")
        .update({
          status: "active",
          grace_ends_at: null,
          suspended_at: null,
          reactivated_at: wasBlocked ? nowIso : null,
          asaas_payment_id: retriedPayment.id,
          updated_at: nowIso,
        })
        .eq("owner_user_id", subRow.owner_user_id);

      try {
        await admin
          .from("payments")
          .update({ status: "paid", paid_at: nowIso, retry_count: undefined as never })
          .eq("gateway_payment_id", retriedPayment.id);
      } catch { /* tabela payments é best-effort aqui */ }

      try {
        await admin.from("notifications").insert({
          owner_user_id: subRow.owner_user_id,
          user_id: subRow.owner_user_id,
          type: "payment_succeeded",
          title: "Pagamento aprovado",
          message: `O pagamento foi aprovado no novo cartão ${cardBrand} •••• ${cardLastFour} e o acesso da sua equipe foi restaurado.`,
        });
      } catch (e) {
        console.warn("[asaas-update-card] notificação falhou:", e);
      }
    } else if (retriedPayment) {
      try {
        await admin
          .from("payments")
          .update({ status: "pending" })
          .eq("gateway_payment_id", retriedPayment.id);
      } catch { /* best-effort */ }
    }

    return response(200, {
      ok: true,
      card: { brand: cardBrand, last_four: cardLastFour },
      retried: !!retriedPayment,
      payment_status: retriedPayment?.status ?? null,
      access_restored: accessRestored,
    });
  } catch (e) {
    console.error("[asaas-update-card] erro:", e);
    const msg = e instanceof Error ? e.message : "unknown_error";
    const friendly = msg.startsWith("Asaas")
      ? "O gateway recusou a atualização. Revise os dados do cartão e tente novamente."
      : msg;
    return response(500, { error: friendly });
  }
});
