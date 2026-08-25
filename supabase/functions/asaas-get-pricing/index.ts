// Preços vigentes da assinatura Hora Pro.
//
// A fonte única da verdade é a tabela do backend (_shared/billingPlans.ts):
// 8 pacotes por quantidade de usuários e ciclos mensal/semestral/anual com
// descontos de 10%/20%. Público (landing e tela de assinatura); a validação
// real acontece sempre no servidor na hora de criar a cobrança.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { BILLING_CYCLES, BILLING_PLANS, GRACE_DAYS, TRIAL_DAYS } from "../_shared/billingPlans.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = {
      plans: BILLING_PLANS.map((p) => ({
        seats: p.seats,
        monthly_brl: p.monthlyCents / 100,
      })),
      cycles: BILLING_CYCLES.map((c) => ({
        months: c.months,
        key: c.key,
        label: c.label,
        discount: c.discount,
      })),
      trial_days: TRIAL_DAYS,
      grace_days: GRACE_DAYS,
    };

    return new Response(JSON.stringify(payload), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
      },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[asaas-get-pricing] erro:", message);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
