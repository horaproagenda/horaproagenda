import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    logStep("Authenticating user with token");
    
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    
    // Check for customers
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    
    if (customers.data.length === 0) {
      logStep("No customer found");
      return new Response(JSON.stringify({ 
        subscribed: false,
        product_id: null,
        seats: 0,
        expires_at: null
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    // Check for successful payments (one-time purchases)
    const paymentIntents = await stripe.paymentIntents.list({
      customer: customerId,
      limit: 10,
    });

    let activeSubscription = null;
    let productId = null;
    let seats = 0;
    let expiresAt = null;

    // Find the most recent successful payment with valid subscription
    for (const payment of paymentIntents.data) {
      if (payment.status === 'succeeded' && payment.metadata) {
        const months = parseInt(payment.metadata.months || '0');
        const paymentDate = new Date(payment.created * 1000);
        const expirationDate = new Date(paymentDate);
        expirationDate.setMonth(expirationDate.getMonth() + months);
        
        if (expirationDate > new Date()) {
          activeSubscription = payment;
          productId = payment.metadata.product_id;
          expiresAt = expirationDate.toISOString();
          
          // Determine seats based on product
          const seatsMap: Record<string, number> = {
            'prod_Tm5HqJDUmZsz91': 1,
            'prod_Tm5Hq1fvr7du6d': 3,
            'prod_Tm5ZVK0PgVfaAe': 5,
            'prod_Tm5ZZS8wW3u9gI': 8,
            'prod_Tm5axgFjRbD1FH': 10,
            'prod_Tm5aG2Nvd6hKqK': 12,
            'prod_Tm5bGNPJxKccy9': 15,
            'prod_Tm5bwjw2rdYpkc': 20,
          };
          seats = seatsMap[productId] || 0;
          break;
        }
      }
    }

    // Also check checkout sessions for metadata
    if (!activeSubscription) {
      const sessions = await stripe.checkout.sessions.list({
        customer: customerId,
        limit: 10,
      });

      for (const session of sessions.data) {
        if (session.payment_status === 'paid' && session.metadata) {
          const months = parseInt(session.metadata.months || '0');
          const paymentDate = new Date(session.created * 1000);
          const expirationDate = new Date(paymentDate);
          expirationDate.setMonth(expirationDate.getMonth() + months);
          
          if (expirationDate > new Date()) {
            productId = session.metadata.price_id;
            expiresAt = expirationDate.toISOString();
            
            // Get product from price
            try {
              const price = await stripe.prices.retrieve(productId);
              const actualProductId = price.product as string;
              
              const seatsMap: Record<string, number> = {
                'prod_Tm5HqJDUmZsz91': 1,
                'prod_Tm5Hq1fvr7du6d': 3,
                'prod_Tm5ZVK0PgVfaAe': 5,
                'prod_Tm5ZZS8wW3u9gI': 8,
                'prod_Tm5axgFjRbD1FH': 10,
                'prod_Tm5aG2Nvd6hKqK': 12,
                'prod_Tm5bGNPJxKccy9': 15,
                'prod_Tm5bwjw2rdYpkc': 20,
              };
              seats = seatsMap[actualProductId] || 0;
              productId = actualProductId;
            } catch (e) {
              console.error("Error getting price:", e);
            }
            
            activeSubscription = session;
            break;
          }
        }
      }
    }

    logStep("Subscription check complete", { 
      hasSubscription: !!activeSubscription, 
      productId, 
      seats, 
      expiresAt 
    });

    return new Response(JSON.stringify({
      subscribed: !!activeSubscription,
      product_id: productId,
      seats,
      expires_at: expiresAt
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in check-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
