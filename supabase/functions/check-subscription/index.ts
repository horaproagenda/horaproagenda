import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mapa de productId -> seats (mantém sincronizado com src/lib/plans.ts)
const PRODUCT_TO_SEATS: Record<string, number> = {
  'prod_UdyKWqSfnyVzne': 1,
  'prod_UdyLMg0kyRjuD4': 3,
  'prod_UdyLfa56HjYEki': 6,
  'prod_UdyLncotTRCD59': 10,
  'prod_UdyNFZJ4PBvLLT': 15,
  'prod_UdyO4ihw5Sa6Nf': 20,
  'prod_UdyPoKIa4khU4r': 25,
  'prod_UdyPbVSxOACQ61': 30,
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      logStep("No Stripe customer");
      return new Response(JSON.stringify({
        subscribed: false,
        product_id: null,
        price_id: null,
        seats: 0,
        current_period_end: null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    const customerId = customers.data[0].id;

    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    if (subs.data.length === 0) {
      logStep("No active subscription");
      // Atualiza account_subscriptions: se trial expirou e não há sub, status fica como está
      return new Response(JSON.stringify({
        subscribed: false,
        product_id: null,
        price_id: null,
        seats: 0,
        current_period_end: null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    const sub = subs.data[0];
    const item = sub.items.data[0];
    const productId = item.price.product as string;
    const priceId = item.price.id;
    const seats = PRODUCT_TO_SEATS[productId] ?? 0;
    const currentPeriodEnd = new Date(sub.current_period_end * 1000).toISOString();

    logStep("Active subscription found", { productId, priceId, seats });

    // Sincroniza account_subscriptions
    const { error: upErr } = await supabaseAdmin
      .from('account_subscriptions')
      .update({
        status: 'active',
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        stripe_price_id: priceId,
        plan_tier: seats,
        seat_limit: seats,
        current_period_end: currentPeriodEnd,
      })
      .eq('owner_user_id', user.id);
    if (upErr) logStep("Failed to sync account_subscriptions", upErr);

    return new Response(JSON.stringify({
      subscribed: true,
      product_id: productId,
      price_id: priceId,
      seats,
      current_period_end: currentPeriodEnd,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message });
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
