// Checkout de pagamento antecipado (prepay) — mode: 'payment'.
// Suporta Pix (default) e Boleto via body.methods = ['pix'] | ['boleto'] | ['pix','boleto'].
// Valor = seats × unit_amount do preço vigente no Stripe (lookup key do ciclo).
// Quando o pagamento é confirmado (async_payment_succeeded), o stripe-webhook
// lê metadata.kind='prepay' e estende current_period_end pelo número de meses pagos.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { resolvePricing } from "../_shared/pricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_SEATS = new Set<number>([1, 3, 6, 10, 15, 20, 25, 30]);


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabase.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("Usuário não autenticado");

    const body = await req.json().catch(() => ({}));
    const seats = Number(body?.seats ?? 0);
    const billingMonths = Number(body?.billingMonths ?? 0);
    const requestedMethods = Array.isArray(body?.methods) && body.methods.length > 0
      ? body.methods
      : ["pix"];
    const ALLOWED_METHODS = new Set(["pix", "boleto"]);
    const methods = requestedMethods
      .map((m: unknown) => String(m).toLowerCase())
      .filter((m: string) => ALLOWED_METHODS.has(m));
    if (methods.length === 0) throw new Error("methods inválido (aceito: pix, boleto)");
    if (!ALLOWED_SEATS.has(seats)) throw new Error("seats inválido");
    if (![1, 6, 12].includes(billingMonths)) throw new Error("billingMonths inválido");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Valor vem do preço vigente no Stripe (lookup key do ciclo) × seats.
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const pricing = await resolvePricing(stripe, supabaseAdmin);
    const cycle = pricing[billingMonths];
    if (!cycle) throw new Error(`Preço não encontrado no Stripe para ${billingMonths} mês(es)`);
    const amount = seats * cycle.unit_amount;
    if (amount <= 0) throw new Error("Valor calculado inválido");


    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId = customers.data[0]?.id;

    // Se Boleto está entre os métodos, pré-anexa o CPF do usuário como tax_id
    // no Customer do Stripe — evita que o cliente redigite (e erre) o CPF
    // no checkout. Se não houver Customer ainda, cria um.
    if (methods.includes("boleto")) {
      try {
        const { data: reg } = await supabase
          .from("trial_registrations")
          .select("cpf, cnpj, full_name")
          .eq("email", user.email)
          .maybeSingle();
        const cpfDigits = (reg?.cpf ?? "").replace(/\D/g, "");
        const cnpjDigits = (reg?.cnpj ?? "").replace(/\D/g, "");

        if (!customerId) {
          const created = await stripe.customers.create({
            email: user.email,
            name: reg?.full_name || undefined,
            metadata: { user_id: user.id },
          });
          customerId = created.id;
        }

        if (customerId && (cpfDigits.length === 11 || cnpjDigits.length === 14)) {
          const existingTaxIds = await stripe.customers.listTaxIds(customerId, { limit: 20 });
          const type = cnpjDigits.length === 14 ? "br_cnpj" : "br_cpf";
          const value = cnpjDigits.length === 14 ? cnpjDigits : cpfDigits;
          const already = existingTaxIds.data.some((t) => t.type === type && t.value === value);
          if (!already) {
            await stripe.customers.createTaxId(customerId, { type, value }).catch((e) => {
              console.warn("[create-pix-checkout] tax_id attach failed:", e?.message || e);
            });
          }
        }
      } catch (e) {
        console.warn("[create-pix-checkout] pre-fill CPF skipped:", e);
      }
    }

    const origin = req.headers.get("origin") || Deno.env.get("APP_URL") || "https://horaproagenda.app";

    const cycleLabel =
      billingMonths === 1 ? "mês" : billingMonths === 6 ? "6 meses" : "12 meses";
    const productName = `Hora Pro — ${seats} usuário${seats > 1 ? "s" : ""} · ${cycleLabel}`;
    const methodLabel = methods.includes("boleto") && methods.includes("pix")
      ? "Pix ou Boleto"
      : methods.includes("boleto")
        ? "Boleto"
        : "Pix";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      mode: "payment",
      payment_method_types: methods as ("pix" | "boleto")[],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "brl",
          unit_amount: amount,
          product_data: {
            name: productName,
            description: `Acesso liberado por ${cycleLabel} após confirmação (${methodLabel}).`,
          },
        },
      }],
      // Se boleto está entre os métodos, coleta o CPF/CNPJ no próprio checkout
      // (Stripe valida o dígito verificador — se o cliente digitar errado,
      // aparece "ID fiscal inválido"). Já pré-anexamos no Customer acima quando
      // temos o CPF do cadastro.
      tax_id_collection: methods.includes("boleto") ? { enabled: true } : undefined,
      // Sessão de checkout expira em ~24h; boleto gerado tem seu próprio prazo (~3 dias úteis).
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 23 + 55 * 60,
      success_url: `${origin}/assinatura/sucesso?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/assinatura/cancelado`,
      metadata: {
        user_id: user.id,
        billing_months: String(billingMonths),
        seats: String(seats),
        kind: "prepay",
        method: methods.join(","),
      },
      payment_intent_data: {
        metadata: {
          user_id: user.id,
          billing_months: String(billingMonths),
          seats: String(seats),
          kind: "prepay",
          method: methods.join(","),
        },
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[create-pix-checkout] error:", message);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
