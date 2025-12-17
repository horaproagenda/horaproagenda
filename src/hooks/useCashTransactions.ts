import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CashTransaction {
  id: string;
  cash_register_id: string | null;
  type: 'income' | 'expense';
  category: string;
  description: string | null;
  amount: number;
  payment_method: string | null;
  bank_id: string | null;
  reference_id: string | null;
  reference_type: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export function useCashTransactions(cashRegisterId?: string) {
  const queryClient = useQueryClient();

  const { data: transactions = [], isLoading, refetch } = useQuery({
    queryKey: ['cash_transactions', cashRegisterId],
    queryFn: async () => {
      let query = supabase
        .from('cash_transactions')
        .select('*')
        .order('created_at', { ascending: false });

      if (cashRegisterId) {
        query = query.eq('cash_register_id', cashRegisterId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as CashTransaction[];
    },
  });

  const createTransaction = useMutation({
    mutationFn: async (transaction: Omit<CashTransaction, 'id' | 'created_at' | 'updated_at'>) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('cash_transactions')
        .insert({
          ...transaction,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
    },
    onError: (error: any) => {
      toast.error('Erro ao registrar transação: ' + error.message);
    },
  });

  const deleteTransaction = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('cash_transactions')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
    },
    onError: (error: any) => {
      toast.error('Erro ao excluir transação: ' + error.message);
    },
  });

  return {
    transactions,
    isLoading,
    refetch,
    createTransaction,
    deleteTransaction,
  };
}
