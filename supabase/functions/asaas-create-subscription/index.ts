// Cria (ou reaproveita) o cliente no Asaas e abre a assinatura recorrente do
// plano escolhido, devolvendo a URL de pagamento (Pix, cartão ou boleto).
//
// Valores: vêm dos Links de Pagamento do Asaas (nunca fixos em código).
// Liberação do acesso: pelo webhook `asaas-webhook` (tempo real) e, como
// reforço, pelo `asaas-check-subscription` no retorno da tela de sucesso.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  asaasFetch,
  buildExternalReference,
  CYCLE_BY_MONTHS,
  onlyDigits,
} from "../_shared/asaas.ts";
import { perSeatCents } from "../_shared/asaasPricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_SEATS = new Set<number>([1, 3, 6, 10, 15, 20, 25, 30]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

interface AsaasCustomer { id: string }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // 1) Identidade do solicitante — sempre validada aqui dentro.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Faça login para assinar." }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    const user = userData?.user;
    if (userErr || !user?.email) return json({ error: "Sessão inválida." }, 401);

    const body = await req.json().catch(() => ({}));
    const seats = Number(body?.seats ?? 0);
    const billingMonths = Number(body?.billingMonths ?? 0);
    const documentInput = onlyDigits(body?.cpfCnpj);
    if (!ALLOWED_SEATS.has(seats)) return json({ error: "Quantidade de usuários inválida." }, 400);
    if (!CYCLE_BY_MONTHS[billingMonths]) return json({ error: "Ciclo de cobrança inválido." }, 400);

    // 2) Dados do assinante (CPF/CNPJ é obrigatório no Asaas).
    const { data: settings } = await admin
      .from("business_settings")
      .select("clinic_name, clinic_cnpj, clinic_phone, clinic_email, professional_name")
      .eq("account_owner_id", user.id)
      .maybeSingle();

    const cpfCnpj = documentInput || onlyDigits(settings?.clinic_cnpj);
    if (!cpfCnpj || (cpfCnpj.length !== 11 && cpfCnpj.length !== 14)) {
      return json({
        error: "Informe um CPF ou CNPJ válido para emitir a cobrança.",
        need_document: true,
      }, 400);
    }

    const name =
      settings?.clinic_name ||
      settings?.professional_name ||
      (user.user_metadata?.full_name as string | undefined) ||
      user.email;

    const { data: subRow } = await admin
      .from("account_subscriptions")
      .select("id, asaas_customer_id, asaas_subscription_id")
      .eq("owner_user_id", user.id)
      .maybeSingle();

    // 3) Cliente no Asaas: reaproveita o vinculado à conta, senão procura pelo
    //    e-mail e, em último caso, cria.
    let customerId = subRow?.asaas_customer_id ?? null;
    if (!customerId) {
      const found = await asaasFetch<{ data: AsaasCustomer[] }>(
        `/customers?email=${encodeURIComponent(user.email)}&limit=1`,
      );
      customerId = found?.data?.[0]?.id ?? null;
    }
    const customerPayload = {
      name,
      email: user.email,
      cpfCnpj,
      mobilePhone: onlyDigits(settings?.clinic_phone) || undefined,
      externalReference: user.id,
      notificationDisabled: false,
    };
    if (customerId) {
      await asaasFetch(`/customers/${customerId}`, {
        method: "POST",
        body: JSON.stringify(customerPayload),
      });
    } else {
      const created = await asaasFetch<AsaasCustomer>("/customers", {
        method: "POST",
        body: JSON.stringify(customerPayload),
      });
      customerId = created.id;
    }

    // 4) Valor total do ciclo = valor por usuário (Asaas) × usuários.
    const perSeat = await perSeatCents(billingMonths, admin);
    const value = Math.round(perSeat * seats) / 100;

    // 5) Encerra a assinatura anterior (troca de plano) e cria a nova.
    if (subRow?.asaas_subscription_id) {
      try {
        await asaasFetch(`/subscriptions/${subRow.asaas_subscription_id}`, {
          method: "DELETE",
        });
      } catch (e) {
        console.warn("[asaas-create-subscription] assinatura antiga não removida:", e);
      }
    }

    const origin = req.headers.get("origin") || Deno.env.get("APP_URL") ||
      "https://horaproagenda.app";
    const today = new Date().toISOString().slice(0, 10);
    const externalReference = buildExternalReference(user.id, seats, billingMonths);

    const subscription = await asaasFetch<{ id: string }>("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        customer: customerId,
        billingType: "UNDEFINED", // o cliente escolhe Pix, cartão ou boleto
        value,
        nextDueDate: today,
        cycle: CYCLE_BY_MONTHS[billingMonths],
        description: `Hora Pro — ${seats} usuário(s) · ${
          billingMonths === 1 ? "mensal" : billingMonths === 6 ? "semestral" : "anual"
        }`,
        externalReference,
challenge: undefined,
        callback: {
          successUrl: `${origin}/assinatura/sucesso?provider=asaas`,
          autoRedirect: true,
        },
      }),
    });

    // 6) URL de pagamento da primeira cobrança do ciclo.
    const payments = await asaasFetch<{ data: Array<{ id: string; invoiceUrl?: string }> }>(
      `/subscriptions/${subscription.id}/payments?limit=1`,
    );
    const first = payments?.data?.[0];
    if (!first?.invoiceUrl) {
      throw new Error("O Asaas não retornou o link de pagamento da cobrança.");
    }

    // 7) Guarda os vínculos (o status só muda quando o pagamento é confirmado).
    const patch = {
      payment_provider: "asaas",
      asaas_customer_id: customerId,
      asaas_subscription_id: subscription.id,
      asaas_payment_id: first.id,
    };
    if (subRow?.id) {
      await admin.from("account_subscriptions").update(patch).eq("owner_user_id", user.id);
    } else {
      await admin.from("account_subscriptions").insert({
        owner_user_id: user.id,
        status: "trial",
        seat_limit: seats,
        ...patch,
      });
    }

    console.log("[asaas-create-subscription] assinatura criada", {
      user: user.id, seats, billingMonths, value, subscription: subscription.id,
    });

    return json({
      url: first.invoiceUrl,
      subscription_id: subscription.id,
      payment_id: first.id,
      value,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[asaas-create-subscription] erro:", message);
    return json({ error: message }, 500);
  }
});
