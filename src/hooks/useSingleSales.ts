import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SingleSale {
  id: string;
  client_id: string | null;
  service_id: string | null;
  package_id: string | null;
  item_type: 'service' | 'package';
  description: string | null;
  original_amount: number;
  discount_amount: number;
  final_amount: number;
  payment_method_id: string | null;
  bank_id: string | null;
  sale_date: string;
  notes: string | null;
  created_by: string | null;
  paid_by: string | null;
  paid_at: string | null;
  installments: number;
  card_fee_amount: number;
  created_at: string;
  updated_at: string;
  client?: { id: string; name: string };
  service?: { id: string; name: string; price: number };
  package?: { id: string; name: string; total_price: number };
  payment_method?: { id: string; name: string };
  bank?: { id: string; name: string };
}

export function useSingleSales() {
  const queryClient = useQueryClient();

  const { data: sales = [], isLoading, refetch } = useQuery({
    queryKey: ['single_sales'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('single_sales')
        .select(`
          *,
          client:clients(id, name),
          service:services(id, name, price),
          package:service_packages(id, name, total_price),
          payment_method:payment_methods(id, name),
          bank:banks(id, name)
        `)
        .order('sale_date', { ascending: false });

      if (error) throw error;
      return data as SingleSale[];
    },
  });

  const createSale = useMutation({
    mutationFn: async (sale: Omit<SingleSale, 'id' | 'created_at' | 'updated_at' | 'client' | 'service' | 'payment_method' | 'bank'>) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('single_sales')
        .insert({
          ...sale,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['single_sales'] });
      queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      toast.success('Venda registrada com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao registrar venda: ' + error.message);
    },
  });

  const deleteSale = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('single_sales')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['single_sales'] });
      toast.success('Venda excluída com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao excluir venda: ' + error.message);
    },
  });

  const totalSales = sales.reduce((sum, s) => sum + Number(s.final_amount), 0);

  return {
    sales,
    totalSales,
    isLoading,
    refetch,
    createSale,
    deleteSale,
  };
}
