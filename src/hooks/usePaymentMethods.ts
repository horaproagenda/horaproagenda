import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PaymentMethod {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  card_fee: number | null;
  installment_fee: number | null;
  max_installments: number | null;
  created_at: string;
  updated_at: string;
}

export function usePaymentMethods() {
  const queryClient = useQueryClient();

  const { data: paymentMethods = [], isLoading, refetch } = useQuery({
    queryKey: ['payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as PaymentMethod[];
    },
  });

  const createPaymentMethod = useMutation({
    mutationFn: async (paymentMethod: Partial<Omit<PaymentMethod, 'id' | 'created_at' | 'updated_at'>> & { name: string; is_active: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('payment_methods')
        .insert({
          ...paymentMethod,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment_methods'] });
      toast.success('Forma de pagamento criada com sucesso!');
    },
    onError: (error: any) => {
      // 23505 = unique_violation — forma de pagamento já existe (seed idempotente). Silencia o toast.
      if (error?.code === '23505' || String(error?.message || '').toLowerCase().includes('duplicate')) return;
      toast.error('Erro ao criar forma de pagamento: ' + error.message);
    },
  });

  const updatePaymentMethod = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PaymentMethod> & { id: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('payment_methods')
        .update({
          ...updates,
          updated_by: user?.id,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment_methods'] });
      toast.success('Forma de pagamento atualizada com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar forma de pagamento: ' + error.message);
    },
  });

  const deletePaymentMethod = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('payment_methods')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment_methods'] });
      toast.success('Forma de pagamento excluída com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao excluir forma de pagamento: ' + error.message);
    },
  });

  const activePaymentMethods = paymentMethods.filter(pm => pm.is_active);

  return {
    paymentMethods,
    activePaymentMethods,
    isLoading,
    refetch,
    createPaymentMethod,
    updatePaymentMethod,
    deletePaymentMethod,
  };
}
