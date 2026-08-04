import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  PLANS,
  BILLING_PERIODS,
  FALLBACK_PER_SEAT_CYCLE_BRL,
  type Plan,
  type BillingPeriod,
} from '@/lib/plans';

export interface CyclePricing {
  months: number;
  perSeatBRL: number; // valor por usuário no ciclo (R$)
  priceId: string | null;
  currency: string;
}

interface PricingRow {
  lookup_key: string;
  price_id: string;
  unit_amount: number;
  currency: string;
  interval_months: number;
}

function buildCycles(rows: PricingRow[] | null): Record<number, CyclePricing> {
  const out: Record<number, CyclePricing> = {};
  // fallback: últimos valores conhecidos
  for (const [months, perSeat] of Object.entries(FALLBACK_PER_SEAT_CYCLE_BRL)) {
    out[Number(months)] = {
      months: Number(months),
      perSeatBRL: perSeat,
      priceId: null,
      currency: 'brl',
    };
  }
  for (const row of rows ?? []) {
    out[row.interval_months] = {
      months: row.interval_months,
      perSeatBRL: row.unit_amount / 100,
      priceId: row.price_id,
      currency: row.currency,
    };
  }
  return out;
}

/**
 * Preços da assinatura vindos do Stripe (fonte única da verdade).
 *
 * Leitura direta de `pricing_cache` (leitura pública) + Realtime: quando o
 * preço muda no Stripe, o webhook atualiza a tabela e a tela reflete em
 * segundos, sem deploy. Se o cache estiver vazio, chama `get-pricing`, que
 * consulta o Stripe e popula a tabela.
 */
export function usePricing() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['pricing-cache'],
    queryFn: async (): Promise<Record<number, CyclePricing>> => {
      // 1) Fonte da verdade: get-pricing consulta o Stripe (com cache curto no
      //    servidor) e atualiza `pricing_cache`. Chamamos sempre para que uma
      //    alteração de valor no painel do Stripe reflita no app em minutos,
      //    mesmo sem os eventos `price.*` do webhook configurados.
      const { data: fn, error: fnErr } = await supabase.functions.invoke('get-pricing');
      if (!fnErr && Array.isArray(fn?.cycles) && fn.cycles.length > 0) {
        const rows = (fn.cycles as Array<{
          lookup_key: string;
          price_id: string;
          unit_amount: number;
          currency: string;
          months: number;
        }>).map((c) => ({
          lookup_key: c.lookup_key,
          price_id: c.price_id,
          unit_amount: c.unit_amount,
          currency: c.currency,
          interval_months: c.months,
        })) as PricingRow[];
        return buildCycles(rows);
      }
      if (fnErr) console.warn('[usePricing] get-pricing failed:', fnErr.message);

      // 2) Stripe indisponível: usa a última leitura válida do cache.
      const { data, error } = await supabase
        .from('pricing_cache')
        .select('lookup_key, price_id, unit_amount, currency, interval_months')
        .eq('active', true);
      if (error) console.warn('[usePricing] cache read error:', error.message);
      if (data && data.length > 0) return buildCycles(data as PricingRow[]);

      return buildCycles(null);
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60_000,
  });



  // Realtime: preço alterado no Stripe → webhook grava no cache → refetch.
  useEffect(() => {
    const channel = supabase
      .channel('pricing-cache-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pricing_cache' },
        () => qc.invalidateQueries({ queryKey: ['pricing-cache'] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const cycles = query.data ?? buildCycles(null);
  const perSeatMonthlyBRL = cycles[1]?.perSeatBRL ?? FALLBACK_PER_SEAT_CYCLE_BRL[1];

  /** Total do ciclo para N usuários (R$). */
  const cycleTotal = (seats: number, months: number): number => {
    const perSeat = cycles[months]?.perSeatBRL ?? perSeatMonthlyBRL * months;
    return Math.round(seats * perSeat * 100) / 100;
  };

  /** Preço mensal "de tabela" (sem desconto) para N usuários. */
  const monthlyTotal = (seats: number) => Math.round(seats * perSeatMonthlyBRL * 100) / 100;

  /** Planos com preço mensal dinâmico. */
  const plans: Plan[] = PLANS.map((p) => ({ ...p, priceBRL: monthlyTotal(p.seats) }));

  /** Ciclos com desconto calculado a partir dos preços reais do Stripe. */
  const periods: BillingPeriod[] = BILLING_PERIODS.map((p) => {
    const full = perSeatMonthlyBRL * p.months;
    const real = cycles[p.months]?.perSeatBRL ?? full;
    const discount = full > 0 ? Math.max(0, 1 - real / full) : 0;
    const pct = Math.round(discount * 100);
    return { ...p, discount, badge: pct > 0 ? `-${pct}%` : undefined };
  });

  return {
    cycles,
    perSeatMonthlyBRL,
    plans,
    periods,
    cycleTotal,
    monthlyTotal,
    isLoading: query.isLoading,
  };
}
