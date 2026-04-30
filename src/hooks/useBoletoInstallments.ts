import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface BoletoInstallment {
  id: string;
  sale_id: string;
  installment_number: number;
  total_installments: number;
  amount: number;
  due_date: string;
  paid_date: string | null;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

const BOLETO_KEYS = ['boleto_installments', 'boleto_installments_all'] as const;

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  BOLETO_KEYS.forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
  queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
  queryClient.invalidateQueries({ queryKey: ['appointments'] });
  queryClient.invalidateQueries({ queryKey: ['reminders'] });
  queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
}

export function useBoletoInstallments(saleId?: string) {
  const queryClient = useQueryClient();

  const { data: installments = [], isLoading } = useQuery({
    queryKey: ['boleto_installments', saleId],
    queryFn: async () => {
      let query = supabase
        .from('boleto_installments')
        .select('*')
        .order('installment_number', { ascending: true });

      if (saleId) {
        query = query.eq('sale_id', saleId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as BoletoInstallment[];
    },
    enabled: !!saleId,
  });

  const createInstallments = useMutation({
    mutationFn: async (params: {
      saleId: string;
      totalInstallments: number;
      totalAmount: number;
      firstDueDate: string;
      intervalDays?: number;
    }) => {
      const { saleId, totalInstallments, totalAmount, firstDueDate, intervalDays = 30 } = params;
      const installmentAmount = Math.round((totalAmount / totalInstallments) * 100) / 100;
      const remainder = Math.round((totalAmount - installmentAmount * totalInstallments) * 100) / 100;

      const { data: { user } } = await supabase.auth.getUser();

      const records = Array.from({ length: totalInstallments }, (_, i) => {
        const dueDate = new Date(firstDueDate);
        dueDate.setDate(dueDate.getDate() + i * intervalDays);
        
        return {
          sale_id: saleId,
          installment_number: i + 1,
          total_installments: totalInstallments,
          amount: i === 0 ? installmentAmount + remainder : installmentAmount,
          due_date: dueDate.toISOString().split('T')[0],
          status: 'pending' as const,
          created_by: user?.id || null,
        };
      });

      const { error } = await supabase
        .from('boleto_installments')
        .insert(records);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll(queryClient);
      toast.success('Parcelas de boleto criadas!');
    },
    onError: (error: any) => {
      toast.error('Erro ao criar parcelas: ' + error.message);
    },
  });

  const markAsPaid = useMutation({
    mutationFn: async (params: { id: string; paidDate?: string }) => {
      const { error } = await supabase
        .from('boleto_installments')
        .update({
          status: 'paid',
          paid_date: params.paidDate || new Date().toISOString().split('T')[0],
        })
        .eq('id', params.id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll(queryClient);
      toast.success('Parcela marcada como paga!');
    },
  });

  const cancelInstallment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('boleto_installments')
        .update({ status: 'cancelled' })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll(queryClient);
      toast.success('Parcela cancelada!');
    },
  });

  const updateInstallment = useMutation({
    mutationFn: async (params: { id: string; amount?: number; due_date?: string; notes?: string }) => {
      const { id, ...updates } = params;
      const { error } = await supabase
        .from('boleto_installments')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll(queryClient);
      toast.success('Parcela atualizada!');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar parcela: ' + error.message);
    },
  });

  return {
    installments,
    isLoading,
    createInstallments,
    markAsPaid,
    cancelInstallment,
    updateInstallment,
  };
}

// Hook for all boleto installments (for financial reports)
export function useAllBoletoInstallments() {
  const queryClient = useQueryClient();

  // Realtime sync
  useEffect(() => {
    const channel = supabase
      .channel('boleto_installments_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boleto_installments' }, () => {
        queryClient.invalidateQueries({ queryKey: ['boleto_installments_all'] });
        queryClient.invalidateQueries({ queryKey: ['boleto_installments'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: installments = [], isLoading } = useQuery({
    queryKey: ['boleto_installments_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('boleto_installments')
        .select(`
          *,
          sale:single_sales(
            id, description, client_id, original_amount, final_amount, paid_at,
            client:clients(id, name, phone)
          )
        `)
        .order('due_date', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    staleTime: 0,
  });

  const markAsPaid = useMutation({
    mutationFn: async (params: { id: string; paidDate?: string }) => {
      const { error } = await supabase
        .from('boleto_installments')
        .update({
          status: 'paid',
          paid_date: params.paidDate || new Date().toISOString().split('T')[0],
        })
        .eq('id', params.id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll(queryClient);
      toast.success('Parcela marcada como paga!');
    },
  });

  const batchMarkAsPaid = useMutation({
    mutationFn: async (params: { ids: string[]; paidDate?: string }) => {
      const paidDate = params.paidDate || new Date().toISOString().split('T')[0];
      const { error } = await supabase
        .from('boleto_installments')
        .update({ status: 'paid', paid_date: paidDate })
        .in('id', params.ids);

      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      invalidateAll(queryClient);
      toast.success(`${vars.ids.length} parcela(s) marcada(s) como paga(s)!`);
    },
    onError: (error: any) => {
      toast.error('Erro na baixa em lote: ' + error.message);
    },
  });

  const updateInstallment = useMutation({
    mutationFn: async (params: { id: string; amount?: number; due_date?: string; notes?: string }) => {
      const { id, ...updates } = params;
      const { error } = await supabase
        .from('boleto_installments')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll(queryClient);
      toast.success('Parcela atualizada!');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar: ' + error.message);
    },
  });

  const cancelInstallment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('boleto_installments')
        .update({ status: 'cancelled' })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll(queryClient);
      toast.success('Parcela cancelada!');
    },
  });

  // Trigger manual sync
  const triggerSync = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-boleto-status');
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      invalidateAll(queryClient);
      toast.success(`Sincronização concluída: ${data?.marked_overdue_installments || 0} boleto(s) atualizado(s)`);
    },
    onError: (error: any) => {
      toast.error('Erro na sincronização: ' + error.message);
    },
  });

  return {
    installments,
    isLoading,
    markAsPaid,
    batchMarkAsPaid,
    updateInstallment,
    cancelInstallment,
    triggerSync,
  };
}
