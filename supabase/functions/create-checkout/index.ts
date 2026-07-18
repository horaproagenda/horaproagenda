import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Seats permitidos (mantém sincronizado com src/lib/plans.ts).
const ALLOWED_SEATS = new Set<number>([1, 3, 6, 10, 15, 20, 25, 30]);

// Stripe price IDs recorrentes por ciclo (produto Hora Pro - Assinatura,
// preço por 1 usuário). Cobrança = quantity (seats) × price do ciclo.
// Conta Stripe: acct_1Tue8WDNBKGVlEDv (modo live).
const BILLING_PRICE_IDS: Record<number, string> = {
  1:  'price_1Tuf4ZDNBKGVlEDvehLJcVJX', // R$ 110,00 / mês
  6:  'price_1Tuf5CDNBKGVlEDvaRVN4VqB', // R$ 645,62 / semestre
  12: 'price_1Tuf5XDNBKGVlEDvwng5c269', // R$ 1.276,86 / ano
};


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
    const seats = Number(body?.seats ?? 0);
    const billingMonths = Number(body?.billingMonths ?? 1);
    if (!ALLOWED_SEATS.has(seats)) throw new Error("seats inválido");
    const cyclePrice = BILLING_PRICE_IDS[billingMonths];
    if (!cyclePrice) throw new Error("billingMonths inválido");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    const customerId = customers.data[0]?.id;

    const origin = req.headers.get("origin") || Deno.env.get("APP_URL") || "https://horaproagenda.app";

    const session: Stripe.Checkout.Session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price: cyclePrice,
        quantity: seats,
      }],
      success_url: `${origin}/assinatura/sucesso?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/assinatura/cancelado`,
      subscription_data: {
        metadata: {
          user_id: user.id,
          billing_months: String(billingMonths),
          seats: String(seats),
          kind: billingMonths === 1 ? 'recurring_monthly' : 'recurring_multi_month',
        },
      },
      metadata: {
        user_id: user.id,
        billing_months: String(billingMonths),
        seats: String(seats),
        kind: billingMonths === 1 ? 'recurring_monthly' : 'recurring_multi_month',
      },
      allow_promotion_codes: true,
    });


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
