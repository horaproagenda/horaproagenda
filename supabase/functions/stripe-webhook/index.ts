// Webhook do Stripe — atualiza account_subscriptions em tempo real.
// IMPORTANTE: registrado em supabase/config.toml com verify_jwt = false (Stripe não envia JWT).
// Validamos a assinatura HMAC do payload com STRIPE_WEBHOOK_SECRET.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { fetchPricingFromStripe } from "../_shared/pricing.ts";
import {
  handlePaymentFailure,
  notifyAccessSuspended,
  formatBrl,
} from "../_shared/paymentFailureNotify.ts";



const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// Seats vêm de `item.quantity` diretamente (produto único no Stripe,
// cobrança por quantidade de usuários).

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

/**
 * Na API basil, `current_period_end` vive no subscription item (não no
 * objeto Subscription). Ler direto de `sub` gerava Invalid Date.
 */
function subPeriodEnd(sub: Stripe.Subscription): Date | null {
  // deno-lint-ignore no-explicit-any
  const s = sub as any;
  const raw = s.current_period_end ?? s.items?.data?.[0]?.current_period_end ?? null;
  if (!raw) return null;
  const d = new Date(Number(raw) * 1000);
  return isNaN(d.getTime()) ? null : d;
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
  const seats = item?.quantity ?? 0;

  let status: 'active' | 'past_due' | 'canceled' | 'trial' = 'active';
  if (sub.status === 'trialing') status = 'trial';
  else if (sub.status === 'active') status = 'active';
  else if (sub.status === 'past_due' || sub.status === 'unpaid') status = 'past_due';
  else if (['canceled', 'incomplete_expired'].includes(sub.status)) status = 'canceled';

  // Fim do teste gratuito (cartão já salvo → cobrança automática nesta data).
  const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;

  const { error } = await supabase
    .from('account_subscriptions')
    .update({
      status,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      stripe_price_id: priceId,
      plan_tier: seats,
      seat_limit: seats,
      ...(trialEnd ? { trial_ends_at: trialEnd.toISOString() } : {}),
      ...(subPeriodEnd(sub) ? { current_period_end: subPeriodEnd(sub)!.toISOString() } : {}),
    })
    .eq('owner_user_id', ownerId);


  if (error) log("Update failed", { error: error.message, ownerId });
  else log("Synced subscription", { ownerId, status, seats, priceId });

  if (status === 'past_due') {
    // Cobrança recusada (inclui a do fim do teste): aplica carência e avisa
    // administrador + equipe. Idempotente por ciclo de cobrança, então o
    // evento de invoice e o de subscription não geram e-mails duplicados.
    const isTrialCharge = !!sub.trial_end
      && Date.now() - sub.trial_end * 1000 < 3 * 24 * 60 * 60 * 1000;
    await handlePaymentFailure(
      supabase,
      ownerId,
      {
        isTrialCharge,
        idempotencyBase: `sub-${sub.id}-${subPeriodEnd(sub)?.getTime() ?? 0}`,
      },
      sendEmailTo,
      log,
    );
  }

  if (sub.status === 'unpaid') {
    await notifyAccessSuspended(
      supabase,
      ownerId,
      `sub-unpaid-${sub.id}`,
      sendEmailTo,
      'Todas as tentativas de cobrança automática foram recusadas.',
    );
  }

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

  // Idempotência: registra o event.id antes de processar. Se já existir,
  // o Stripe reenviou o mesmo evento (comum em async_payment_succeeded do Pix)
  // e devolvemos 200 sem re-executar o handler para evitar dupla liberação.
  {
    const { error: dupErr } = await supabase
      .from('processed_stripe_events')
      .insert({ event_id: event.id, event_type: event.type });
    if (dupErr) {
      // 23505 = unique_violation → já processado
      // Qualquer outro código: log e prossegue (falha ao registrar não deve travar o webhook,
      // mas idempotência não fica garantida nesse caso).
      // deno-lint-ignore no-explicit-any
      const code = (dupErr as any).code;
      if (code === '23505') {
        log('Duplicate event, skipping', { id: event.id, type: event.type });
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }
      log('Failed to record processed event', { error: dupErr.message, id: event.id });
    }
  }



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
          await notifyAccessSuspended(
            supabase,
            ownerId,
            `sub-deleted-${sub.id}`,
            sendEmailTo,
            'A assinatura foi encerrada no processador de pagamentos.',
          );

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
            const periodEnd = subPeriodEnd(sub) ?? new Date();
            const item = sub.items.data[0];
            const seats = item?.quantity ?? 0;
            await sendAccountEmail(
              ownerId,
              'subscription_activated',
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
            // A cobrança do fim do teste chega com billing_reason
            // "subscription_cycle" logo após trial_end. Detectamos pelo
            // trial_end da assinatura (até 3 dias atrás).
            let isTrialCharge = false;
            if (invoice.subscription) {
              try {
                const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
                const trialEndMs = sub.trial_end ? sub.trial_end * 1000 : 0;
                isTrialCharge = !!trialEndMs
                  && Date.now() - trialEndMs < 3 * 24 * 60 * 60 * 1000;
              } catch (e) {
                log('Falha ao ler assinatura da invoice', { e: e instanceof Error ? e.message : String(e) });
              }
            }
            await handlePaymentFailure(
              supabase,
              ownerId,
              {
                isTrialCharge,
                amount: formatBrl(invoice.amount_due, invoice.currency ?? 'brl'),
                idempotencyBase: `invoice-${invoice.id}`,
              },
              sendEmailTo,
              log,
            );
          }
        }
        break;
      }

      // Stripe desistiu das tentativas de cobrança → suspensão definitiva.
      case "invoice.marked_uncollectible": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          const ownerId = await findOwnerByCustomer(customerId);
          if (ownerId) {
            await supabase
              .from('account_subscriptions')
              .update({ status: 'past_due' })
              .eq('owner_user_id', ownerId);
            await notifyAccessSuspended(
              supabase,
              ownerId,
              `invoice-uncollectible-${invoice.id}`,
              sendEmailTo,
              'A cobrança foi encerrada como não recebida pelo processador de pagamentos.',
            );
          }
        }
        break;
      }


      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'subscription' && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          await syncSubscription(sub);
        } else if (session.mode === 'payment' && session.metadata?.kind === 'prepay' && session.payment_status === 'paid') {
          await handlePrepaySession(session);
        }
        break;
      }

      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
        const email = session.customer_details?.email ?? null;
        if (customerId || email) {
          const ownerId = await findOwnerByCustomer(customerId ?? '', email);
          if (ownerId) {
            await sendAccountEmail(ownerId, 'payment_failed', {}, `stripe-async-failed-${session.id}`);
          }
        }
        break;
      }

      // ─────────────────────────────────────────────────────────────
      // Chargebacks / disputas / estornos → cancelamento AUTOMÁTICO
      // Política Hora Pro: não emitimos nem aceitamos estornos.
      // Qualquer sinal de disputa ou refund revoga o acesso em tempo real.
      // ─────────────────────────────────────────────────────────────
      case "charge.dispute.created":
      case "charge.dispute.funds_withdrawn":
      case "charge.dispute.closed":
      case "charge.refunded":
      case "charge.refund.updated":
      case "refund.created":
      case "refund.updated": {
        await revokeAccessForPaymentEvent(event);
        break;
      }

      // ─────────────────────────────────────────────────────────────
      // Mudança de preço no Stripe → atualiza o cache e o app em tempo real.
      // ─────────────────────────────────────────────────────────────
      case "price.created":
      case "price.updated":
      case "price.deleted":
      case "product.updated": {
        try {
          await fetchPricingFromStripe(stripe, supabase);
          log("Pricing cache refreshed", { type: event.type });
        } catch (e) {
          log("Pricing cache refresh failed", { msg: e instanceof Error ? e.message : String(e) });
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

/** Envia o template de status da conta para um e-mail específico. */
async function sendEmailTo(
  recipientEmail: string,
  name: string | undefined,
  templateData: Record<string, unknown>,
  idempotencyKey: string,
) {
  try {
    const { error } = await supabase.functions.invoke('send-transactional-email', {
      headers: { 'x-internal-secret': Deno.env.get('INTERNAL_EMAIL_SECRET') ?? '' },
      body: {
        templateName: 'account-status-update',
        recipientEmail,
        idempotencyKey,
        templateData: { name, ...templateData },
      },
    });
    if (error) log('Email send failed', { error: error.message, idempotencyKey });
    else log('Email enqueued', { idempotencyKey });
  } catch (e) {
    log('Email threw', { idempotencyKey, e: e instanceof Error ? e.message : String(e) });
  }
}

async function sendAccountEmail(

  ownerUserId: string,
  kind: 'subscription_activated' | 'payment_failed' | 'past_due' | 'payment_recorded' | 'trial_extended' | 'lifetime_granted',
  data: Record<string, unknown>,
  idempotencyKey: string,
) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: u } = await (supabase.auth as any).admin.getUserById(ownerUserId);
    const email = u?.user?.email as string | undefined;
    if (!email) {
      log('No email for owner, skipping notification', { ownerUserId, kind });
      return;
    }
    const name = (u?.user?.user_metadata?.full_name as string | undefined)
      ?? (u?.user?.user_metadata?.name as string | undefined)
      ?? email.split('@')[0];
    const { error } = await supabase.functions.invoke('send-transactional-email', {
      headers: { 'x-internal-secret': Deno.env.get('INTERNAL_EMAIL_SECRET') ?? '' },
      body: {
        templateName: 'account-status-update',
        recipientEmail: email,
        idempotencyKey,
        templateData: { kind, name, ...data },
      },
    });
    if (error) log('Email send failed', { error: error.message, kind });
    else log('Email enqueued', { ownerUserId, kind });
  } catch (e) {
    log('Email threw', { kind, e: e instanceof Error ? e.message : String(e) });
  }
}

/** Pagamento antecipado (3/6/12 meses) via Pix/Cartão/Boleto — estende current_period_end. */
async function handlePrepaySession(session: Stripe.Checkout.Session) {
  const months = Number(session.metadata?.billing_months ?? 0);
  const seats = Number(session.metadata?.seats ?? 0);
  const priceId = session.metadata?.price_id ?? null;
  const userId = session.metadata?.user_id ?? null;
  if (!months || !userId) {
    log('Prepay session missing metadata', { sessionId: session.id });
    return;
  }
  const customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id ?? null;

  // resolve owner: prefer metadata user_id
  let ownerId: string | null = userId;
  if (!ownerId && customerId) {
    ownerId = await findOwnerByCustomer(customerId, session.customer_details?.email ?? null);
  }
  if (!ownerId) {
    log('Prepay: owner not found', { sessionId: session.id });
    return;
  }

  // lê current_period_end atual para estender a partir do maior entre now e ele
  const { data: current } = await supabase
    .from('account_subscriptions')
    .select('current_period_end')
    .eq('owner_user_id', ownerId)
    .maybeSingle();

  const baseMs = Math.max(
    Date.now(),
    current?.current_period_end ? new Date(current.current_period_end).getTime() : 0,
  );
  // adiciona N meses (≈ months * 30.44 dias) — usar setMonth para respeitar calendário
  const newDate = new Date(baseMs);
  newDate.setMonth(newDate.getMonth() + months);

  const update: Record<string, unknown> = {
    status: 'active',
    current_period_end: newDate.toISOString(),
  };
  if (seats > 0) {
    update.plan_tier = seats;
    update.seat_limit = seats;
  }
  if (priceId) update.stripe_price_id = priceId;
  if (customerId) update.stripe_customer_id = customerId;

  const { error } = await supabase
    .from('account_subscriptions')
    .update(update)
    .eq('owner_user_id', ownerId);
  if (error) {
    log('Prepay update failed', { error: error.message, ownerId });
    return;
  }
  log('Prepay applied', { ownerId, months, newPeriodEnd: newDate.toISOString() });

  await sendAccountEmail(
    ownerId,
    'subscription_activated',
    {
      planLabel: seats ? `${seats} usuário${seats > 1 ? 's' : ''} · ${months} meses` : `${months} meses`,
      validUntil: newDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    },
    `stripe-prepay-${session.id}`,
  );
}


/**
 * Revoga acesso do dono da conta associada a um pagamento contestado/estornado.
 * Aciona em eventos: charge.dispute.*, charge.refunded, refund.*.
 * Marca account_subscriptions.status = 'canceled' em tempo real e notifica o dono.
 */
async function revokeAccessForPaymentEvent(event: Stripe.Event) {
  try {
    // deno-lint-ignore no-explicit-any
    const obj = event.data.object as any;
    let customerId: string | null = null;
    let reason = event.type;

    if (obj?.customer) {
      customerId = typeof obj.customer === 'string' ? obj.customer : obj.customer?.id ?? null;
    }
    // refund → tem charge, precisa buscar
    if (!customerId && obj?.charge) {
      const chargeId = typeof obj.charge === 'string' ? obj.charge : obj.charge?.id;
      if (chargeId) {
        const ch = await stripe.charges.retrieve(chargeId);
        customerId = typeof ch.customer === 'string' ? ch.customer : ch.customer?.id ?? null;
      }
    }
    // dispute → payment_intent
    if (!customerId && obj?.payment_intent) {
      const piId = typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id;
      if (piId) {
        const pi = await stripe.paymentIntents.retrieve(piId);
        customerId = typeof pi.customer === 'string' ? pi.customer : pi.customer?.id ?? null;
      }
    }

    if (!customerId) {
      log('revokeAccess: customer not found', { type: event.type, id: event.id });
      return;
    }
    const ownerId = await findOwnerByCustomer(customerId);
    if (!ownerId) {
      log('revokeAccess: owner not found', { customerId });
      return;
    }

    const { error } = await supabase
      .from('account_subscriptions')
      .update({
        status: 'canceled',
        current_period_end: new Date().toISOString(),
      })
      .eq('owner_user_id', ownerId);

    if (error) {
      log('revokeAccess update failed', { error: error.message, ownerId });
      return;
    }
    log('Access revoked (chargeback/refund)', { ownerId, reason, eventId: event.id });

    await supabase.from('audit_log').insert({
      action: 'access_revoked_payment_dispute',
      table_name: 'account_subscriptions',
      record_id: ownerId,
      new_data: { reason, stripe_event_id: event.id, customer_id: customerId },
    }).then(({ error: e }) => { if (e) log('audit insert failed', { e: e.message }); });

    await sendAccountEmail(
      ownerId,
      'payment_failed',
      { reason: 'Contestação/estorno detectado. Acesso suspenso conforme Termos de Serviço (seções 5 e 6).' },
      `stripe-revoke-${event.id}`,
    );
  } catch (e) {
    log('revokeAccess threw', { e: e instanceof Error ? e.message : String(e) });
  }
}
