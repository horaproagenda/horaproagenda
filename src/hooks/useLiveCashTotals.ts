import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ensureNetAmount } from '@/lib/netValueCalculation';

/**
 * useLiveCashTotals
 *
 * Ferramenta UNIFICADA de totais em tempo real do caixa, usada por Caixa,
 * Agenda e Financeiro para exibir SEMPRE o mesmo valor:
 *  - entradas (income) brutas
 *  - saídas (expense) brutas
 *  - descontos aplicados
 *  - taxas de cartão
 *  - valor líquido (entradas - descontos - taxas)
 *  - saldo atual = saldo de abertura + entradas - saídas
 *
 * Atualiza:
 *  1. A cada 1 segundo (tick) — recalcula a partir do cache local
 *  2. Em tempo real via Supabase Realtime (cash_transactions, cash_registers,
 *     single_sales, boleto_installments) — invalida e refaz fetch
 */

export interface LiveCashTotals {
  income: number;          // Entradas brutas (recebido)
  expense: number;         // Saídas
  discounts: number;       // Descontos aplicados
  cardFees: number;        // Taxas de cartão
  net: number;             // Líquido = income - discounts - cardFees
  balance: number;         // Saldo atual do caixa aberto
  openingBalance: number;  // Saldo de abertura
  lastUpdate: Date;        // Timestamp da última atualização (tick 1s)
  isOpen: boolean;         // Há caixa aberto?
}

export function useLiveCashTotals(): LiveCashTotals {
  const queryClient = useQueryClient();
  const [tick, setTick] = useState(0);

  // Tick a cada 1 segundo para forçar recomputação dos totais
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 1_000_000), 1000);
    return () => clearInterval(id);
  }, []);

  // Caixa atualmente aberto
  const { data: openRegister } = useQuery({
    queryKey: ['cash_registers', 'open-live'],
    queryFn: async () => {
      const { data } = await supabase
        .from('cash_registers')
        .select('id, opening_balance, opened_at, status')
        .eq('status', 'open')
        .maybeSingle();
      return data;
    },
    staleTime: 0,
    refetchInterval: 5000, // segurança extra
  });

  // Transações do caixa aberto
  const { data: transactions = [] } = useQuery({
    queryKey: ['cash_transactions', openRegister?.id, 'live'],
    enabled: !!openRegister?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('cash_transactions')
        .select('amount, type, card_fee_amount, reference_id, reference_type')
        .eq('cash_register_id', openRegister!.id);
      return data || [];
    },
    staleTime: 0,
    refetchInterval: 3000,
  });

  // Vendas do caixa atual (para descontos e taxas)
  const { data: sales = [] } = useQuery({
    queryKey: ['single_sales', 'live-totals', openRegister?.opened_at],
    enabled: !!openRegister?.opened_at,
    queryFn: async () => {
      const { data } = await supabase
        .from('single_sales')
        .select('final_amount, original_amount, discount_amount, card_fee_amount, paid_at')
        .gte('sale_date', openRegister!.opened_at);
      return data || [];
    },
    staleTime: 0,
    refetchInterval: 3000,
  });

  // Realtime: refresh imediato em mudanças relevantes
  useEffect(() => {
    const ch = supabase
      .channel('live-cash-totals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_transactions' }, () => {
        queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_registers' }, () => {
        queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'single_sales' }, () => {
        queryClient.invalidateQueries({ queryKey: ['single_sales'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boleto_installments' }, () => {
        queryClient.invalidateQueries({ queryKey: ['boleto_installments'] });
        queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [queryClient]);

  return useMemo<LiveCashTotals>(() => {
    const income = transactions
      .filter((t: any) => t.type === 'income')
      .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);

    const expense = transactions
      .filter((t: any) => t.type === 'expense')
      .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);

    const discounts = sales.reduce(
      (sum: number, s: any) => sum + Number(s.discount_amount || 0),
      0,
    );

    const cardFees = sales.reduce(
      (sum: number, s: any) => sum + Number(s.card_fee_amount || 0),
      0,
    );

    const net = ensureNetAmount(income, cardFees, discounts);
    const openingBalance = Number(openRegister?.opening_balance || 0);
    const balance = openingBalance + income - expense;

    return {
      income,
      expense,
      discounts,
      cardFees,
      net,
      balance,
      openingBalance,
      lastUpdate: new Date(),
      isOpen: !!openRegister,
    };
    // tick is a deliberate dependency to force a re-render every second
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, sales, openRegister, tick]);
}
