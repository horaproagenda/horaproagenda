import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  PLANS,
  BILLING_PERIODS,
  TRIAL_DAYS,
  GRACE_DAYS,
  periodTotal,
  type Plan,
  type BillingPeriod,
} from '@/lib/plans';

interface PricingResponse {
  plans?: Array<{ seats: number; monthly_brl: number }>;
  cycles?: Array<{ months: number; key: string; label: string; discount: number }>;
  trial_days?: number;
  grace_days?: number;
}

/**
 * Preços da assinatura vindos do backend (asaas-get-pricing), que lê a tabela
 * oficial de planos (_shared/billingPlans.ts). O cálculo final de qualquer
 * cobrança é refeito no servidor — aqui é apenas exibição. Se a função estiver
 * indisponível, usa o espelho local de src/lib/plans.ts.
 */
export function usePricing() {
  const query = useQuery({
    queryKey: ['billing-pricing'],
    queryFn: async (): Promise<PricingResponse | null> => {
      const { data, error } = await supabase.functions.invoke('asaas-get-pricing');
      if (error) {
        console.warn('[usePricing] asaas-get-pricing failed:', error.message);
        return null;
      }
      return (data ?? null) as PricingResponse | null;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const server = query.data;

  /** Planos com o preço mensal oficial do servidor (fallback: espelho local). */
  const plans: Plan[] = PLANS.map((p) => {
    const remote = server?.plans?.find((sp) => sp.seats === p.seats);
    return { ...p, priceBRL: remote?.monthly_brl ?? p.priceBRL };
  });

  /** Ciclos com desconto oficial (fallback: espelho local). */
  const periods: BillingPeriod[] = BILLING_PERIODS.map((p) => {
    const remote = server?.cycles?.find((c) => c.months === p.months);
    const discount = remote?.discount ?? p.discount;
    const pct = Math.round(discount * 100);
    return { ...p, discount, badge: pct > 0 ? `-${pct}%` : undefined };
  });

  /** Preço mensal "de tabela" (sem desconto) do pacote de N usuários. */
  const monthlyTotal = (seats: number): number =>
    plans.find((p) => p.seats === seats)?.priceBRL ?? 0;

  /** Total do ciclo para N usuários (R$), com o desconto do período. */
  const cycleTotal = (seats: number, months: number): number =>
    periodTotal(monthlyTotal(seats), months);

  return {
    plans,
    periods,
    monthlyTotal,
    cycleTotal,
    trialDays: server?.trial_days ?? TRIAL_DAYS,
    graceDays: server?.grace_days ?? GRACE_DAYS,
    isLoading: query.isLoading,
  };
}
