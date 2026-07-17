import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAccountOwnerId } from '@/hooks/useAccountOwnerId';
import { FinancialCategory } from './useFinancialCategories';
import { PaymentMethod } from './usePaymentMethods';

export interface FinancialEntry {
  id: string;
  type: 'receivable' | 'payable';
  category_id: string | null;
  description: string;
  amount: number;
  due_date: string;
  paid_date: string | null;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  payment_method_id: string | null;
  bank_id: string | null;
  client_id: string | null;
  professional_id: string | null;
  appointment_id: string | null;
  notes: string | null;
  is_recurring: boolean;
  recurring_day: number | null;
  recurring_count: number | null;
  recurring_frequency: string | null;
  installments: number | null;
  original_amount?: number | null;
  paid_by: string | null;
  created_at: string;
  updated_at: string;
  category?: FinancialCategory;
  payment_method?: PaymentMethod;
  client?: { id: string; name: string };
  bank?: { id: string; name: string };
  professional?: { id: string; name: string };
}

export function useFinancialEntries() {
  const queryClient = useQueryClient();
  const accountOwnerId = useAccountOwnerId();

  // Realtime sync for financial_entries (tenant-scoped)
  useEffect(() => {
    if (!accountOwnerId) return;
    const channel = supabase
      .channel(`financial_entries_changes-${accountOwnerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_entries' }, () => {
        queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, accountOwnerId]);

  const { data: entries = [], isLoading, refetch } = useQuery({
    queryKey: ['financial_entries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_entries')
        .select(`
          *,
          category:financial_categories(*),
          payment_method:payment_methods(*),
          client:clients(id, name),
          bank:banks(id, name),
          professional:professionals(id, name)
        `)
        .order('due_date', { ascending: false });

      if (error) throw error;
      return data as FinancialEntry[];
    },
  });

  const createEntry = useMutation({
    mutationFn: async (entry: Omit<FinancialEntry, 'id' | 'created_at' | 'updated_at' | 'category' | 'payment_method' | 'client' | 'bank'>) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('financial_entries')
        .insert({
          ...entry,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      toast.success('Lançamento criado com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao criar lançamento: ' + error.message);
    },
  });

  const updateEntry = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<FinancialEntry> & { id: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { category, payment_method, client, bank, professional, ...cleanUpdates } = updates as any;
      
      const { data, error } = await supabase
        .from('financial_entries')
        .update({
          ...cleanUpdates,
          updated_by: user?.id,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      toast.success('Lançamento atualizado com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar lançamento: ' + error.message);
    },
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      // IMPORTANT: deleting a single receivable/payable must NOT cascade the whole sale.
      // Package-linked sales must be undone explicitly through CancelPackageDialog
      // (see RelatorioConsolidado), otherwise a stray trash click in "Contas a Receber"
      // would wipe an entire package + its scheduled sessions with no confirmation.
      const { error } = await supabase
        .from('financial_entries')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      queryClient.invalidateQueries({ queryKey: ['single_sales'] });
      queryClient.invalidateQueries({ queryKey: ['client-sales'] });
      queryClient.invalidateQueries({ queryKey: ['service_packages'] });
      queryClient.invalidateQueries({ queryKey: ['client_packages'] });
      queryClient.invalidateQueries({ queryKey: ['client_packages_with_counts'] });
      queryClient.invalidateQueries({ queryKey: ['package_appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client_services'] });
      queryClient.invalidateQueries({ queryKey: ['client_credits'] });
      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['boleto_installments'] });
      toast.success('Lançamento excluído com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao excluir lançamento: ' + error.message);
    },
  });

  const receivables = entries.filter(e => e.type === 'receivable');
  const payables = entries.filter(e => e.type === 'payable');
  const pendingReceivables = receivables.filter(e => e.status === 'pending' || e.status === 'overdue');
  const pendingPayables = payables.filter(e => e.status === 'pending' || e.status === 'overdue');

  // Filter payables for current month only
  const currentMonthStart = startOfMonth(new Date());
  const currentMonthEnd = endOfMonth(new Date());
  const currentMonthPayables = pendingPayables.filter(e => {
    const dueDate = parseISO(e.due_date);
    return isWithinInterval(dueDate, { start: currentMonthStart, end: currentMonthEnd });
  });

  const totalReceivables = pendingReceivables.reduce((sum, e) => sum + Number(e.amount), 0);
  const totalPayables = currentMonthPayables.reduce((sum, e) => sum + Number(e.amount), 0);

  return {
    entries,
    receivables,
    payables,
    pendingReceivables,
    pendingPayables,
    totalReceivables,
    totalPayables,
    isLoading,
    refetch,
    createEntry,
    updateEntry,
    deleteEntry,
  };
}
