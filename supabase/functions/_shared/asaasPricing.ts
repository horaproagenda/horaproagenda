// Preços da assinatura — fonte única da verdade: os Links de Pagamento do Asaas.
//
// Um link por ciclo, com o valor POR USUÁRIO. O ciclo é lido do campo
// `subscriptionCycle` e, na falta dele, do nome do link.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { asaasFetch, MONTHS_BY_CYCLE } from "./asaas.ts";

export const LOOKUP_KEYS: Record<number, string> = {
  1: "horapro_seat_monthly",
  6: "horapro_seat_semiannual",
  12: "horapro_seat_annual",
};

export interface PaymentLink {
  id: string;
  name?: string;
  value?: number | null;
  active?: boolean;
  subscriptionCycle?: string | null;
}

export interface CyclePricing {
  months: number;
  lookup_key: string;
  price_id: string; // id do link de pagamento no Asaas
  unit_amount: number; // centavos, por usuário/ciclo
  currency: string;
}

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

/** Lê os links do Asaas e (opcionalmente) atualiza o cache no Supabase. */
export async function fetchAsaasPricing(
  admin?: SupabaseClient,
): Promise<CyclePricing[]> {
  const data = await asaasFetch<{ data: PaymentLink[] }>(
    "/paymentLinks?limit=100&active=true",
  );
  const cycles = buildCycles(data?.data ?? []);
  if (cycles.length > 0 && admin) {
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
    if (error) console.warn("[asaasPricing] cache falhou:", error.message);
  }
  return cycles;
}

/** Valor por usuário no ciclo (centavos). Cai no cache se o Asaas falhar. */
export async function perSeatCents(
  months: number,
  admin: SupabaseClient,
): Promise<number> {
  try {
    const cycles = await fetchAsaasPricing(admin);
    const found = cycles.find((c) => c.months === months);
    if (found) return found.unit_amount;
  } catch (e) {
    console.warn("[asaasPricing] leitura do Asaas falhou:", e);
  }
  const { data } = await admin
    .from("pricing_cache")
    .select("unit_amount")
    .eq("interval_months", months)
    .eq("active", true)
    .maybeSingle();
  if (data?.unit_amount) return data.unit_amount as number;
  throw new Error(
    `Nenhum link de pagamento encontrado no Asaas para o ciclo de ${months} mês(es).`,
  );
}
