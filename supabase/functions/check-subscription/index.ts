import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Seats vêm de `item.quantity` (produto único no Stripe, cobrança por usuário).

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

/**
 * Na API 2025-08-27.basil o campo `current_period_end` saiu do objeto
 * Subscription e passou a viver no subscription item. Ler direto de `sub`
 * devolvia `undefined` → `new Date(NaN).toISOString()` lançava e a função
 * respondia 500, deixando a conta sem ativar após o pagamento.
 */
function subscriptionPeriodEnd(sub: Stripe.Subscription): Date | null {
  // deno-lint-ignore no-explicit-any
  const s = sub as any;
  const raw = s.current_period_end ?? s.items?.data?.[0]?.current_period_end ?? null;
  if (!raw) return null;
  const d = new Date(Number(raw) * 1000);
  return isNaN(d.getTime()) ? null : d;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  const saveSubscription = async (
    ownerUserId: string,
    patch: Record<string, unknown>,
  ) => {
    const { data: existing } = await supabaseAdmin
      .from('account_subscriptions')
      .select('id')
      .eq('owner_user_id', ownerUserId)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from('account_subscriptions')
        .update(patch)
        .eq('owner_user_id', ownerUserId);
      if (error) logStep("Update failed", error);
    } else {
      const { error } = await supabaseAdmin
        .from('account_subscriptions')
        .insert({ owner_user_id: ownerUserId, ...patch });
      if (error) logStep("Insert failed", error);
    }
  };

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

    const notSubscribed = () => new Response(JSON.stringify({
      subscribed: false,
      product_id: null,
      price_id: null,
      seats: 0,
      current_period_end: null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });

    if (customers.data.length === 0) {
      logStep("No Stripe customer");
      return notSubscribed();
    }

    const customerId = customers.data[0].id;

    // Considera também 'trialing' e 'past_due' (acesso não deve cair no
    // instante em que uma cobrança recorrente atrasa — o webhook trata isso).
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
    });
    const sub = subs.data.find((s) => ["active", "trialing", "past_due"].includes(s.status));

    if (!sub) {
      // Sem assinatura recorrente: pode ser pagamento antecipado (Pix/Boleto).
      logStep("No recurring subscription — checking prepay sessions");
      const sessions = await stripe.checkout.sessions.list({ customer: customerId, limit: 20 });
      const prepay = sessions.data
        .filter((s) =>
          s.mode === 'payment' &&
          s.metadata?.kind === 'prepay' &&
          s.payment_status === 'paid'
        )
        .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0];

      if (!prepay) return notSubscribed();

      const months = Number(prepay.metadata?.billing_months ?? 0) || 1;
      const seats = Number(prepay.metadata?.seats ?? 0) || 1;
      const paidAt = new Date((prepay.created ?? Math.floor(Date.now() / 1000)) * 1000);
      const end = new Date(paidAt);
      end.setMonth(end.getMonth() + months);

      if (end.getTime() < Date.now()) {
        logStep("Prepay expired", { sessionId: prepay.id, end: end.toISOString() });
        return notSubscribed();
      }

      await saveSubscription(user.id, {
        status: 'active',
        stripe_customer_id: customerId,
        plan_tier: seats,
        seat_limit: seats,
        current_period_end: end.toISOString(),
      });
      logStep("Prepay access granted", { seats, end: end.toISOString() });

      return new Response(JSON.stringify({
        subscribed: true,
        product_id: null,
        price_id: null,
        seats,
        current_period_end: end.toISOString(),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    const item = sub.items.data[0];
    const productId = item?.price?.product as string | undefined ?? null;
    const priceId = item?.price?.id ?? null;
    const seats = item?.quantity ?? 0;
    const periodEnd = subscriptionPeriodEnd(sub);
    const currentPeriodEnd = periodEnd ? periodEnd.toISOString() : null;

    logStep("Subscription found", { status: sub.status, productId, priceId, seats });

    // Assinatura em teste gratuito: mantemos o status 'trial' com a data em que
    // o cartão salvo será cobrado automaticamente.
    const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
    const localStatus = sub.status === 'past_due'
      ? 'past_due'
      : sub.status === 'trialing' ? 'trial' : 'active';

    await saveSubscription(user.id, {
      status: localStatus,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      stripe_price_id: priceId,
      plan_tier: seats,
      seat_limit: seats,
      ...(trialEnd ? { trial_ends_at: trialEnd } : {}),
      ...(currentPeriodEnd ? { current_period_end: currentPeriodEnd } : {}),
    });

    return new Response(JSON.stringify({
      subscribed: sub.status !== 'past_due',
      trialing: sub.status === 'trialing',
      trial_end: trialEnd,
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
