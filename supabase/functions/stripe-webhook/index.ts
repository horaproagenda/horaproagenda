// Webhook do Stripe — atualiza account_subscriptions em tempo real.
// IMPORTANTE: registrado em supabase/config.toml com verify_jwt = false (Stripe não envia JWT).
// Validamos a assinatura HMAC do payload com STRIPE_WEBHOOK_SECRET.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// Mapa productId -> seats (espelho de src/lib/plans.ts)
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

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${d}`);
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2025-08-27.basil",
});

async function findOwnerByCustomer(customerId: string, fallbackEmail?: string | null) {
  // 1) tenta pelo stripe_customer_id já salvo
  const { data: byCustomer } = await supabase
    .from('account_subscriptions')
    .select('owner_user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (byCustomer?.owner_user_id) return byCustomer.owner_user_id as string;

  // 2) fallback: olha o email do customer na auth
  const email = fallbackEmail ?? (await stripe.customers.retrieve(customerId) as Stripe.Customer)?.email;
  if (!email) return null;
  const { data: users } = await supabase.auth.admin.listUsers();
  const u = users?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
  return u?.id ?? null;
}

async function syncSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const ownerId = await findOwnerByCustomer(customerId);
  if (!ownerId) {
    log("Owner not found for customer", { customerId });
    return;
  }
  const item = sub.items.data[0];
  const productId = item?.price?.product as string | undefined;
  const priceId = item?.price?.id ?? null;
  const seats = productId ? (PRODUCT_TO_SEATS[productId] ?? 0) : 0;

  let status: 'active' | 'past_due' | 'canceled' | 'trial' = 'active';
  if (sub.status === 'active' || sub.status === 'trialing') status = 'active';
  else if (sub.status === 'past_due' || sub.status === 'unpaid') status = 'past_due';
  else if (['canceled', 'incomplete_expired'].includes(sub.status)) status = 'canceled';

  const { error } = await supabase
    .from('account_subscriptions')
    .update({
      status,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      stripe_price_id: priceId,
      plan_tier: seats,
      seat_limit: seats,
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    })
    .eq('owner_user_id', ownerId);

  if (error) log("Update failed", { error: error.message, ownerId });
  else log("Synced subscription", { ownerId, status, seats, priceId });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!signature || !webhookSecret) {
    log("Missing signature or webhook secret");
    return new Response(JSON.stringify({ error: "Missing signature" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("Signature verification failed", { msg });
    return new Response(JSON.stringify({ error: `Webhook error: ${msg}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  log("Event received", { type: event.type, id: event.id });

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.resumed":
      case "customer.subscription.trial_will_end":
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        const ownerId = await findOwnerByCustomer(customerId);
        if (ownerId) {
          await supabase
            .from('account_subscriptions')
            .update({ status: 'canceled', stripe_subscription_id: sub.id })
            .eq('owner_user_id', ownerId);
          log("Subscription canceled", { ownerId });
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
          await syncSubscription(sub);
          const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
          const ownerId = await findOwnerByCustomer(customerId);
          if (ownerId) {
            const periodEnd = new Date(sub.current_period_end * 1000);
            const item = sub.items.data[0];
            const productId = item?.price?.product as string | undefined;
            const seats = productId ? (PRODUCT_TO_SEATS[productId] ?? 0) : 0;
            await sendSubscriptionActivatedEmail(
              ownerId,
              {
                planLabel: seats ? `${seats} usuário${seats > 1 ? 's' : ''}` : undefined,
                validUntil: periodEnd.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
              },
              `stripe-invoice-paid-${invoice.id}`,
            );
          }
        }
        break;
      }


      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          const ownerId = await findOwnerByCustomer(customerId);
          if (ownerId) {
            await supabase
              .from('account_subscriptions')
              .update({ status: 'past_due' })
              .eq('owner_user_id', ownerId);
            log("Marked past_due", { ownerId });
            await sendAccountEmail(ownerId, 'payment_failed', {}, `stripe-invoice-failed-${invoice.id}`);
          }
        }
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'subscription' && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          await syncSubscription(sub);
        } else if (session.mode === 'payment' && session.metadata?.kind === 'prepay') {
          await handlePrepaySession(session);
        }
        break;
      }

      default:
        log("Unhandled event", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("Handler error", { msg });
    // Retorna 200 mesmo em erro do handler para evitar reentregas em loop com erros não-recuperáveis,
    // exceto em falhas transitórias evidentes — Stripe reenvia em 5xx.
    return new Response(JSON.stringify({ received: true, error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});

async function sendSubscriptionActivatedEmail(
  ownerUserId: string,
  data: { planLabel?: string; validUntil?: string },
  idempotencyKey: string,
) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: u } = await (supabase.auth as any).admin.getUserById(ownerUserId);
    const email = u?.user?.email as string | undefined;
    if (!email) {
      log('No email for owner, skipping activation notification', { ownerUserId });
      return;
    }
    const name = (u?.user?.user_metadata?.full_name as string | undefined)
      ?? (u?.user?.user_metadata?.name as string | undefined)
      ?? email.split('@')[0];
    const { error } = await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'account-status-update',
        recipientEmail: email,
        idempotencyKey,
        templateData: { kind: 'subscription_activated', name, ...data },
      },
    });
    if (error) log('Activation email send failed', { error: error.message });
    else log('Activation email enqueued', { ownerUserId });
  } catch (e) {
    log('Activation email threw', { e: e instanceof Error ? e.message : String(e) });
  }
}

