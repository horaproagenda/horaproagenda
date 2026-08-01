// Preços da assinatura Hora Pro — fonte única da verdade: STRIPE.
//
// Cada ciclo tem uma `lookup_key` fixa no Stripe. Para mudar o valor, cria-se
// um preço novo no Stripe transferindo a lookup key ("transfer lookup key").
// Nada de valor fixo em código: o app resolve o price_id pela lookup key.
//
// A tabela public.pricing_cache guarda a última leitura válida, serve de
// fallback caso o Stripe falhe e alimenta o Realtime do frontend.
import type Stripe from "https://esm.sh/stripe@18.5.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export const PRICE_LOOKUP_KEYS: Record<number, string> = {
  1: "horapro_seat_monthly",
  6: "horapro_seat_semiannual",
  12: "horapro_seat_annual",
};

export interface CyclePricing {
  months: number;
  lookup_key: string;
  price_id: string;
  unit_amount: number; // centavos, por usuário/ciclo
  currency: string;
}

export type PricingMap = Record<number, CyclePricing>;

function monthsOf(price: Stripe.Price): number {
  const r = price.recurring;
  if (!r) return 1;
  if (r.interval === "year") return 12 * (r.interval_count ?? 1);
  if (r.interval === "month") return r.interval_count ?? 1;
  if (r.interval === "week") return Math.max(1, Math.round(((r.interval_count ?? 1) * 7) / 30));
  return 1;
}

/** Lê os preços no Stripe pelas lookup keys e atualiza o cache no Supabase. */
export async function fetchPricingFromStripe(
  stripe: Stripe,
  supabase?: SupabaseClient,
): Promise<PricingMap> {
  const lookupKeys = Object.values(PRICE_LOOKUP_KEYS);
  const list = await stripe.prices.list({
    lookup_keys: lookupKeys,
    active: true,
    limit: 20,
    expand: ["data.product"],
  });

  const map: PricingMap = {};
  for (const price of list.data) {
    if (!price.lookup_key || price.unit_amount == null) continue;
    const months = monthsOf(price);
    map[months] = {
      months,
      lookup_key: price.lookup_key,
      price_id: price.id,
      unit_amount: price.unit_amount,
      currency: price.currency,
    };
  }

  if (supabase && Object.keys(map).length > 0) {
    const rows = Object.values(map).map((c) => ({
      lookup_key: c.lookup_key,
      price_id: c.price_id,
      unit_amount: c.unit_amount,
      currency: c.currency,
      interval_months: c.months,
      active: true,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("pricing_cache")
      .upsert(rows, { onConflict: "lookup_key" });
    if (error) console.warn("[pricing] cache upsert failed:", error.message);
  }

  return map;
}

/** Lê o cache no Supabase (fallback quando o Stripe está indisponível). */
export async function fetchPricingFromCache(supabase: SupabaseClient): Promise<PricingMap> {
  const { data, error } = await supabase
    .from("pricing_cache")
    .select("lookup_key, price_id, unit_amount, currency, interval_months")
    .eq("active", true);
  if (error || !data) return {};
  const map: PricingMap = {};
  for (const row of data) {
    map[row.interval_months as number] = {
      months: row.interval_months as number,
      lookup_key: row.lookup_key as string,
      price_id: row.price_id as string,
      unit_amount: row.unit_amount as number,
      currency: row.currency as string,
    };
  }
  return map;
}

/** Stripe primeiro; se falhar, cache. Lança se nenhum dos dois responder. */
export async function resolvePricing(
  stripe: Stripe,
  supabase: SupabaseClient,
): Promise<PricingMap> {
  try {
    const fromStripe = await fetchPricingFromStripe(stripe, supabase);
    if (Object.keys(fromStripe).length > 0) return fromStripe;
    console.warn("[pricing] Stripe returned no prices for lookup keys");
  } catch (e) {
    console.error("[pricing] Stripe lookup failed:", e instanceof Error ? e.message : e);
  }
  const cached = await fetchPricingFromCache(supabase);
  if (Object.keys(cached).length === 0) {
    throw new Error(
      "Preços indisponíveis: nenhum preço ativo encontrado no Stripe para as lookup keys " +
        Object.values(PRICE_LOOKUP_KEYS).join(", "),
    );
  }
  return cached;
}
