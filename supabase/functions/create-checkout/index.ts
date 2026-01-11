import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CheckoutRequest {
  priceId: string;
  billingCycle: 'monthly' | 'quarterly' | 'semiannual' | 'annual';
}

// Pricing configuration with discounts
const BILLING_MULTIPLIERS = {
  monthly: { months: 1, discount: 0 },
  quarterly: { months: 3, discount: 0.10 },
  semiannual: { months: 6, discount: 0.12 },
  annual: { months: 12, discount: 0.15 },
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
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");

    const { priceId, billingCycle } = await req.json() as CheckoutRequest;
    
    if (!priceId) throw new Error("Price ID is required");
    if (!billingCycle || !BILLING_MULTIPLIERS[billingCycle]) {
      throw new Error("Invalid billing cycle");
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Check if customer exists
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    // Get the price to calculate discount
    const price = await stripe.prices.retrieve(priceId);
    const monthlyAmount = price.unit_amount || 0;
    
    const billing = BILLING_MULTIPLIERS[billingCycle];
    const totalBeforeDiscount = monthlyAmount * billing.months;
    const discountAmount = Math.round(totalBeforeDiscount * billing.discount);
    const finalAmount = totalBeforeDiscount - discountAmount;

    // Create a checkout session
    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      payment_method_types: ['card', 'boleto'],
      mode: 'payment',
      success_url: `${req.headers.get("origin")}/assinatura/sucesso?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get("origin")}/assinatura/cancelado`,
      metadata: {
        user_id: user.id,
        price_id: priceId,
        billing_cycle: billingCycle,
        months: billing.months.toString(),
      },
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product: price.product as string,
            unit_amount: finalAmount,
          },
          quantity: 1,
        },
      ],
    };

    // Add discount info to metadata
    if (discountAmount > 0) {
      sessionConfig.metadata!.discount_percentage = (billing.discount * 100).toString();
      sessionConfig.metadata!.discount_amount = discountAmount.toString();
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Checkout error:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
