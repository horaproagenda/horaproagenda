// Preços da assinatura Hora Pro — fonte única da verdade: ASAAS.
//
// Você cria no painel do Asaas um Link de Pagamento por ciclo, com o valor
// POR USUÁRIO e o desconto que quiser:
//   - "Hora Pro mensal"      → cobrança recorrente mensal
//   - "Hora Pro semestral"   → cobrança recorrente semestral
//   - "Hora Pro anual"       → cobrança recorrente anual
// O ciclo é identificado pelo campo `subscriptionCycle` do link e, na falta
// dele, pelo nome (mensal/semestral/anual). Alterou o valor no Asaas? O app
// passa a usar o novo valor em minutos, sem deploy.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { asaasFetch, MONTHS_BY_CYCLE } from "../_shared/asaas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export const LOOKUP_KEYS: Record<number, string> = {
  1: "horapro_seat_monthly",
  6: "horapro_seat_semiannual",
  12: "horapro_seat_annual",
};

interface PaymentLink {
  id: string;
  name?: string;
  value?: number | null;
  active?: boolean;
  billingType?: string;
  chargeType?: string;
  subscriptionCycle?: string | null;
}

/** Meses do ciclo do link: campo do Asaas e, na falta, o nome do link. */
export function monthsOfLink(link: PaymentLink): number | null {
  if (link.subscriptionCycle && MONTHS_BY_CYCLE[link.subscriptionCycle]) {
    return MONTHS_BY_CYCLE[link.subscriptionCycle];
  }
  const name = (link.name ?? "").toLowerCase();
  if (/anual|ano/.test(name)) return 12;
  if (/semestral|semestre/.test(name)) return 6;
  if (/mensal|m[eê]s/.test(name)) return 1;
  return null;
}

export interface CyclePricing {
  months: number;
  lookup_key: string;
  price_id: string;
  unit_amount: number; // centavos, por usuário/ciclo
  currency: string;
}

export function buildCycles(links: PaymentLink[]): CyclePricing[] {
  const out: Record<number, CyclePricing> = {};
  for (const link of links) {
    if (link.active === false) continue;
    const months = monthsOfLink(link);
    const value = Number(link.value ?? 0);
    if (!months || !LOOKUP_KEYS[months] || !(value > 0)) continue;
    out[months] = {
      months,
      lookup_key: LOOKUP_KEYS[months],
      price_id: link.id,
      unit_amount: Math.round(value * 100),
      currency: "brl",
    };
  }
  return Object.values(out).sort((a, b) => a.months - b.months);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const data = await asaasFetch<{ data: PaymentLink[] }>(
      "/paymentLinks?limit=100&active=true",
    );
    const cycles = buildCycles(data?.data ?? []);

    if (cycles.length > 0) {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false } },
      );
      const { error } = await admin.from("pricing_cache").upsert(
        cycles.map((c) => ({
          lookup_key: c.lookup_key,
          price_id: c.price_id,
          unit_amount: c.unit_amount,
          currency: c.currency,
          interval_months: c.months,
          active: true,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "lookup_key" },
      );
      if (error) console.warn("[asaas-get-pricing] cache falhou:", error.message);
    }

    return new Response(JSON.stringify({ cycles }), {
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
