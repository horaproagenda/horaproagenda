import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface BankDeposit {
  bank_id: string;
  bank_name: string;
  amount: number;
}

export interface CashRegister {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opening_balance: number;
  closing_balance: number | null;
  expected_balance: number | null;
  difference: number | null;
  total_received: number;
  total_receivables: number;
  payments_count: number;
  payment_breakdown: Record<string, number>;
  notes: string | null;
  opened_by: string | null;
  closed_by: string | null;
  register_number: number;
  status: 'open' | 'closed';
  cash_amount: number | null;
  check_amount: number | null;
  bank_deposits: BankDeposit[];
  created_at: string;
  updated_at: string;
}

export function useCashRegisters() {
  const queryClient = useQueryClient();

  // Realtime sync for cash_registers and cash_transactions
  useEffect(() => {
    const channel = supabase
      .channel('cash_realtime_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_registers' }, () => {
        queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_transactions' }, () => {
        queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
        queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: cashRegisters = [], isLoading, refetch } = useQuery({
    queryKey: ['cash_registers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_registers')
        .select('*')
        .order('opened_at', { ascending: false });

      if (error) throw error;
      
      // Transform data to match our interface
      return (data || []).map(item => ({
        ...item,
        bank_deposits: Array.isArray(item.bank_deposits) 
          ? (item.bank_deposits as unknown as BankDeposit[]) 
          : [],
      })) as CashRegister[];
    },
  });

  const currentOpenRegister = cashRegisters.find(r => r.status === 'open');
  const closedRegisters = cashRegisters.filter(r => r.status === 'closed');

  const openCashRegister = useMutation({
    mutationFn: async (openingBalance: number) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('cash_registers')
        .insert({
          opening_balance: openingBalance,
          opened_by: user?.id,
          status: 'open',
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      toast.success('Caixa aberto com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao abrir caixa: ' + error.message);
    },
  });

  const closeCashRegister = useMutation({
    mutationFn: async (params: {
      id: string;
      closingBalance: number;
      expectedBalance: number;
      totalReceived: number;
      totalReceivables: number;
      paymentsCount: number;
      paymentBreakdown: Record<string, number>;
      notes?: string;
      cashAmount?: number;
      checkAmount?: number;
      bankDeposits?: BankDeposit[];
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const difference = params.closingBalance - params.expectedBalance;
      
      const { data, error } = await supabase
        .from('cash_registers')
        .update({
          closed_at: new Date().toISOString(),
          closing_balance: params.closingBalance,
          expected_balance: params.expectedBalance,
          difference,
          total_received: params.totalReceived,
          total_receivables: params.totalReceivables,
          payments_count: params.paymentsCount,
          payment_breakdown: params.paymentBreakdown,
          notes: params.notes,
          cash_amount: params.cashAmount || 0,
          check_amount: params.checkAmount || 0,
          bank_deposits: JSON.parse(JSON.stringify(params.bankDeposits || [])),
          closed_by: user?.id,
          status: 'closed',
        })
        .eq('id', params.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      toast.success('Caixa fechado com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao fechar caixa: ' + error.message);
    },
  });

  const updateCashRegister = useMutation({
    mutationFn: async (params: {
      id: string;
      opening_balance?: number;
      closing_balance?: number;
      expected_balance?: number;
      total_received?: number;
      total_receivables?: number;
      payments_count?: number;
      payment_breakdown?: Record<string, number>;
      notes?: string;
      cash_amount?: number;
      check_amount?: number;
      bank_deposits?: BankDeposit[];
    }) => {
      const { id, ...updateData } = params;
      
      // Recalculate difference if closing and expected balance are provided
      const dataToUpdate: any = { ...updateData };
      if (updateData.closing_balance !== undefined && updateData.expected_balance !== undefined) {
        dataToUpdate.difference = updateData.closing_balance - updateData.expected_balance;
      }
      
      if (updateData.bank_deposits) {
        dataToUpdate.bank_deposits = JSON.parse(JSON.stringify(updateData.bank_deposits));
      }

      const { data, error } = await supabase
        .from('cash_registers')
        .update(dataToUpdate)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      toast.success('Caixa atualizado com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar caixa: ' + error.message);
    },
  });

  const deleteCashRegister = useMutation({
    mutationFn: async (id: string) => {
      // First delete related cash_transactions
      const { error: transactionsError } = await supabase
        .from('cash_transactions')
        .delete()
        .eq('cash_register_id', id);

      if (transactionsError) throw transactionsError;

      // Then delete the cash register
      const { error } = await supabase
        .from('cash_registers')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      toast.success('Caixa excluído com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao excluir caixa: ' + error.message);
    },
  });

  return {
    cashRegisters,
    currentOpenRegister,
    closedRegisters,
    isLoading,
    refetch,
    openCashRegister,
    closeCashRegister,
    updateCashRegister,
    deleteCashRegister,
  };
}
