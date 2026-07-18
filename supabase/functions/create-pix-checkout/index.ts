// Checkout Pix (pagamento antecipado / prepay) — mode: 'payment'.
// Cria uma sessão do Stripe com Pix como meio, valor = seats × mensal × meses × (1-desconto).
// Quando o Pix é confirmado, o stripe-webhook (checkout.session.async_payment_succeeded)
// lê metadata.kind='prepay' e estende current_period_end pelo número de meses pagos.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_SEATS = new Set<number>([1, 3, 6, 10, 15, 20, 25, 30]);
const PER_SEAT_MONTHLY_CENTS = 11000; // R$ 110,00

// Total em centavos para N meses (espelha BILLING_PERIODS em src/lib/plans.ts).
function totalCents(seats: number, months: number): number {
  const base = seats * PER_SEAT_MONTHLY_CENTS * months;
  if (months === 6) return Math.round(seats * 64562);   // R$ 645,62 por seat
  if (months === 12) return Math.round(seats * 127686); // R$ 1.276,86 por seat
  return base;
}

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
    if (!ALLOWED_SEATS.has(seats)) throw new Error("seats inválido");
    if (![1, 6, 12].includes(billingMonths)) throw new Error("billingMonths inválido");

    const amount = totalCents(seats, billingMonths);
    if (amount <= 0) throw new Error("Valor calculado inválido");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    const customerId = customers.data[0]?.id;

    const origin = req.headers.get("origin") || Deno.env.get("APP_URL") || "https://horaproagenda.app";

    const cycleLabel =
      billingMonths === 1 ? "mês" : billingMonths === 6 ? "6 meses" : "12 meses";
    const productName = `Hora Pro — ${seats} usuário${seats > 1 ? "s" : ""} · ${cycleLabel}`;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      mode: "payment",
      payment_method_types: ["pix"],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "brl",
          unit_amount: amount,
          product_data: {
            name: productName,
            description: `Acesso liberado por ${cycleLabel} após confirmação do Pix.`,
          },
        },
      }],
      // Pix expira em 24h. Damos folga de 23h55.
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 23 + 55 * 60,
      success_url: `${origin}/assinatura/sucesso?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/assinatura/cancelado`,
      metadata: {
        user_id: user.id,
        billing_months: String(billingMonths),
        seats: String(seats),
        kind: "prepay",
        method: "pix",
      },
      payment_intent_data: {
        metadata: {
          user_id: user.id,
          billing_months: String(billingMonths),
          seats: String(seats),
          kind: "prepay",
          method: "pix",
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
