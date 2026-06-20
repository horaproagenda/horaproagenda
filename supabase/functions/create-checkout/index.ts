import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Lista permitida de priceIds (mantém sincronizado com src/lib/plans.ts)
const ALLOWED_PRICE_IDS = new Set<string>([
  'price_1TegO6DgjrAVrKo6qmm4QTAq',
  'price_1TegOYDgjrAVrKo6SWKhm34E',
  'price_1TegOrDgjrAVrKo6Fvsq1Vku',
  'price_1TegPCDgjrAVrKo6a1AsVWED',
  'price_1TegQXDgjrAVrKo68iqKHYkx',
  'price_1TegRlDgjrAVrKo6pgIqgceO',
  'price_1TegSSDgjrAVrKo60IQOSOMn',
  'price_1TegSvDgjrAVrKo6d1LDLKgI',
]);

// Mapa priceId -> seats / nome (espelha src/lib/plans.ts)
const PRICE_INFO: Record<string, { seats: number; monthly: number; name: string }> = {
  'price_1TegO6DgjrAVrKo6qmm4QTAq': { seats: 1,  monthly: 59.90,   name: '1 usuário' },
  'price_1TegOYDgjrAVrKo6SWKhm34E': { seats: 3,  monthly: 129.90,  name: '3 usuários' },
  'price_1TegOrDgjrAVrKo6Fvsq1Vku': { seats: 6,  monthly: 259.80,  name: '6 usuários' },
  'price_1TegPCDgjrAVrKo6a1AsVWED': { seats: 10, monthly: 433.30,  name: '10 usuários' },
  'price_1TegQXDgjrAVrKo68iqKHYkx': { seats: 15, monthly: 649.50,  name: '15 usuários' },
  'price_1TegRlDgjrAVrKo6pgIqgceO': { seats: 20, monthly: 866.00,  name: '20 usuários' },
  'price_1TegSSDgjrAVrKo60IQOSOMn': { seats: 25, monthly: 1082.50, name: '25 usuários' },
  'price_1TegSvDgjrAVrKo6d1LDLKgI': { seats: 30, monthly: 1299.00, name: '30 usuários' },
};

const DISCOUNT: Record<number, number> = { 1: 0, 3: 0.02, 6: 0.03, 12: 0.05 };

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");

    const body = await req.json().catch(() => ({}));
    const priceId = body?.priceId as string | undefined;
    const billingMonths = Number(body?.billingMonths ?? 1);
    if (!priceId) throw new Error("Price ID is required");
    if (!ALLOWED_PRICE_IDS.has(priceId)) throw new Error("Price ID not allowed");
    if (!(billingMonths in DISCOUNT)) throw new Error("billingMonths inválido");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    const customerId = customers.data[0]?.id;

    const origin = req.headers.get("origin") || Deno.env.get("APP_URL") || "https://horaproagenda.app";

    let session: Stripe.Checkout.Session;

    if (billingMonths === 1) {
      // Assinatura recorrente mensal (cartão).
      session = await stripe.checkout.sessions.create({
        customer: customerId,
        customer_email: customerId ? undefined : user.email,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/assinatura/sucesso?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/assinatura/cancelado`,
        subscription_data: { metadata: { user_id: user.id } },
        metadata: { user_id: user.id, price_id: priceId, billing_months: '1' },
        allow_promotion_codes: true,
      });
    } else {
      // Assinatura recorrente trimestral/semestral/anual com desconto aplicado
      // ao valor da cobrança recorrente (cobra automaticamente a cada N meses).
      // Apenas cartão é suportado pelo Stripe para subscriptions no BR.
      const info = PRICE_INFO[priceId];
      if (!info) throw new Error("Plano não encontrado");
      const discount = DISCOUNT[billingMonths];
      const totalBRL = Math.round(info.monthly * billingMonths * (1 - discount) * 100) / 100;
      const unitAmountCents = Math.round(totalBRL * 100);
      const label = `${info.name} · ${billingMonths} meses${discount ? ` (-${Math.round(discount * 100)}%)` : ''}`;

      session = await stripe.checkout.sessions.create({
        customer: customerId,
        customer_email: customerId ? undefined : user.email,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'brl',
            unit_amount: unitAmountCents,
            recurring: { interval: 'month', interval_count: billingMonths },
            product: PRICE_INFO[priceId] ? undefined : undefined,
            product_data: {
              name: `Hora Pro — ${label}`,
            },
          } as Stripe.Checkout.SessionCreateParams.LineItem.PriceData,
        }],
        success_url: `${origin}/assinatura/sucesso?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/assinatura/cancelado`,
        subscription_data: {
          metadata: {
            user_id: user.id,
            price_id: priceId,
            billing_months: String(billingMonths),
            seats: String(info.seats),
            kind: 'recurring_multi_month',
          },
        },
        metadata: {
          user_id: user.id,
          price_id: priceId,
          billing_months: String(billingMonths),
          seats: String(info.seats),
          kind: 'recurring_multi_month',
        },
        allow_promotion_codes: true,
      });
    }

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[create-checkout] error:", message);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
