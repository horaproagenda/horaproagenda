import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { resolvePricing } from "../_shared/pricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Seats permitidos (mantém sincronizado com src/lib/plans.ts).
const ALLOWED_SEATS = new Set<number>([1, 3, 6, 10, 15, 20, 25, 30]);

/** Dias de teste gratuito para quem nunca usou o teste nem pagou. */
const TRIAL_DAYS = 30;

// Os price IDs NÃO são fixos em código: são resolvidos no Stripe pelas
// lookup keys (horapro_seat_monthly / _semiannual / _annual). Para mudar o
// valor, cria-se um preço novo no Stripe transferindo a lookup key.

/**
 * Elegibilidade ao teste de 30 dias — decidida SEMPRE no servidor.
 * Não recebe teste quem: já assinou/pagou antes, já usou o teste,
 * tem acesso vitalício, ou está em bloqueio de exclusão recente.
 */
async function isTrialEligible(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  stripe: Stripe,
  userId: string,
  email: string,
  customerId?: string,
): Promise<boolean> {
  try {
    const { data: sub } = await supabaseAdmin
      .from("account_subscriptions")
      .select("status, is_grandfathered, stripe_subscription_id, trial_ends_at")
      .eq("owner_user_id", userId)
      .maybeSingle();

    if (sub?.is_grandfathered || sub?.status === "grandfathered") return false;
    if (sub?.stripe_subscription_id) return false;

    const { data: reg } = await supabaseAdmin
      .from("trial_registrations")
      .select("has_paid, trial_started_at")
      .eq("email", email.toLowerCase())
      .maybeSingle();
    if (reg?.has_paid) return false;

    const { data: blocked } = await supabaseAdmin
      .from("deleted_account_blocklist")
      .select("id")
      .limit(1);
    // Bloqueio detalhado é avaliado por RPC no cadastro; aqui só evitamos
    // conceder teste quando o próprio e-mail está na lista.
    if (Array.isArray(blocked) && blocked.length > 0) {
      const { data: blockedSelf } = await supabaseAdmin
        .rpc("is_identifier_blocked", { p_email: email, p_cpf: null, p_cnpj: null, p_phone: null });
      if (blockedSelf && (blockedSelf as { blocked?: boolean }).blocked) return false;
    }

    // Já teve qualquer assinatura no Stripe (inclusive cancelada)? Sem novo teste.
    if (customerId) {
      const previous = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 1,
      });
      if (previous.data.length > 0) return false;
    }

    return true;
  } catch (e) {
    console.warn("[create-checkout] falha ao avaliar elegibilidade de teste:", e);
    return false; // em dúvida, cobra normalmente
  }
}




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
    if (![1, 6, 12].includes(billingMonths)) throw new Error("billingMonths inválido");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Preço vigente vem do Stripe (lookup key), nunca de constante em código.
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const pricing = await resolvePricing(stripe, supabaseAdmin);
    const cyclePrice = pricing[billingMonths]?.price_id;
    if (!cyclePrice) throw new Error(`Preço não encontrado no Stripe para ${billingMonths} mês(es)`);


    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    const customerId = customers.data[0]?.id;

    const origin = req.headers.get("origin") || Deno.env.get("APP_URL") || "https://horaproagenda.app";

    // O teste gratuito de 30 dias é concedido no cadastro, dentro do próprio
    // aplicativo, SEM cartão. Portanto o checkout nunca adiciona novo período
    // de teste: ao escolher um plano a assinatura já começa cobrando.
    const trialEligible = false;

    const session: Stripe.Checkout.Session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      mode: 'subscription',
      // Sem payment_method_types fixo: os métodos habilitados no painel do
      // Stripe (cartão, Pix, boleto...) passam a valer automaticamente.
      line_items: [{
        price: cyclePrice,
        quantity: seats,
      }],
      success_url: `${origin}/assinatura/sucesso?session_id={CHECKOUT_SESSION_ID}&checkout=success`,
      cancel_url: `${origin}/assinatura/cancelado`,
      locale: 'pt-BR',
      client_reference_id: user.id,
      billing_address_collection: 'auto',
      tax_id_collection: { enabled: true },
      // Exigido pelo Stripe quando tax_id_collection está ativo em um Customer existente.
      customer_update: customerId ? { name: 'auto', address: 'auto' } : undefined,
      subscription_data: {
        metadata: {
          user_id: user.id,
          billing_months: String(billingMonths),
          seats: String(seats),
          trial_days: '0',
          kind: billingMonths === 1 ? 'recurring_monthly' : 'recurring_multi_month',
        },
      },
      metadata: {
        user_id: user.id,
        billing_months: String(billingMonths),
        seats: String(seats),
        trial_days: '0',
        kind: billingMonths === 1 ? 'recurring_monthly' : 'recurring_multi_month',
      },
      allow_promotion_codes: true,
    });

    console.log("[create-checkout] sessão criada", {
      user: user.id, seats, billingMonths, trialEligible,
    });

    return new Response(JSON.stringify({ url: session.url, trial_days: 0 }), {

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
