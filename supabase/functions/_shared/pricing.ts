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

/**
 * Lê os preços vigentes no Stripe e atualiza o cache no Supabase.
 *
 * Estratégia (tolerante a alterações feitas no painel do Stripe):
 * 1. Busca os preços pelas lookup keys (caminho canônico).
 * 2. Para ciclos sem preço com lookup key (ex.: o usuário criou um preço novo
 *    no painel e arquivou o antigo, sem transferir a lookup key), procura o
 *    preço ATIVO mais recente do mesmo produto com o mesmo intervalo.
 * Assim, qualquer mudança de valor no Stripe reflete no app.
 */
export async function fetchPricingFromStripe(
  stripe: Stripe,
  supabase?: SupabaseClient,
): Promise<PricingMap> {
  const lookupKeys = Object.values(PRICE_LOOKUP_KEYS);
  const list = await stripe.prices.list({
    lookup_keys: lookupKeys,
    active: true,
    limit: 20,
  });

  const map: PricingMap = {};
  const productIds = new Set<string>();
  for (const price of list.data) {
    if (!price.lookup_key || price.unit_amount == null) continue;
    const months = monthsOf(price);
    if (typeof price.product === "string") productIds.add(price.product);
    map[months] = {
      months,
      lookup_key: price.lookup_key,
      price_id: price.id,
      unit_amount: price.unit_amount,
      currency: price.currency,
    };
  }

  // Fallback: ciclos sem lookup key → preço ativo mais recente do produto.
  const missing = Object.keys(PRICE_LOOKUP_KEYS)
    .map(Number)
    .filter((m) => !map[m]);
  if (missing.length > 0) {
    const pids = productIds.size > 0 ? [...productIds] : [undefined];
    for (const product of pids) {
      const all = await stripe.prices.list({ active: true, limit: 100, product });
      const recurring = all.data
        .filter((p) => p.type === "recurring" && p.unit_amount != null)
        .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
      for (const months of missing) {
        if (map[months]) continue;
        const found = recurring.find((p) => monthsOf(p) === months);
        if (!found) continue;
        map[months] = {
          months,
          lookup_key: found.lookup_key ?? PRICE_LOOKUP_KEYS[months],
          price_id: found.id,
          unit_amount: found.unit_amount as number,
          currency: found.currency,
        };
      }
    }
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

/** Lê o cache e informa se ainda está dentro do TTL. */
export async function fetchPricingFromCacheWithAge(
  supabase: SupabaseClient,
): Promise<{ fresh: boolean; map: PricingMap }> {
  const { data, error } = await supabase
    .from("pricing_cache")
    .select("lookup_key, price_id, unit_amount, currency, interval_months, updated_at")
    .eq("active", true);
  if (error || !data || data.length === 0) return { fresh: false, map: {} };
  const map: PricingMap = {};
  let oldest = Date.now();
  for (const row of data) {
    map[row.interval_months as number] = {
      months: row.interval_months as number,
      lookup_key: row.lookup_key as string,
      price_id: row.price_id as string,
      unit_amount: row.unit_amount as number,
      currency: row.currency as string,
    };
    const ts = row.updated_at ? new Date(row.updated_at as string).getTime() : 0;
    if (ts < oldest) oldest = ts;
  }
  return { fresh: Date.now() - oldest < CACHE_TTL_MS, map };
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

// Memo por isolate + TTL do cache: evita bater no Stripe em cada request
// (o que estourava o rate limit e derrubava os checkouts com 500).
const MEMO_TTL_MS = 5 * 60_000;
const CACHE_TTL_MS = 10 * 60_000;
let memo: { at: number; map: PricingMap } | null = null;

/** Cache fresco primeiro; Stripe só quando o cache está vazio ou velho. */
export async function resolvePricing(
  stripe: Stripe,
  supabase: SupabaseClient,
  opts: { force?: boolean } = {},
): Promise<PricingMap> {
  if (!opts.force && memo && Date.now() - memo.at < MEMO_TTL_MS) return memo.map;

  if (!opts.force) {
    const { fresh, map } = await fetchPricingFromCacheWithAge(supabase);
    if (fresh && Object.keys(map).length > 0) {
      memo = { at: Date.now(), map };
      return map;
    }
  }

  try {
    const fromStripe = await fetchPricingFromStripe(stripe, supabase);
    if (Object.keys(fromStripe).length > 0) {
      memo = { at: Date.now(), map: fromStripe };
      return fromStripe;
    }
    console.warn("[pricing] Stripe returned no prices for lookup keys");
  } catch (e) {
    console.error("[pricing] Stripe lookup failed:", e instanceof Error ? e.message : e);
  }
  const cached = await fetchPricingFromCache(supabase);
  if (Object.keys(cached).length > 0) memo = { at: Date.now(), map: cached };
  if (Object.keys(cached).length === 0) {
    throw new Error(
      "Preços indisponíveis: nenhum preço ativo encontrado no Stripe para as lookup keys " +
        Object.values(PRICE_LOOKUP_KEYS).join(", "),
    );
  }
  return cached;
}
