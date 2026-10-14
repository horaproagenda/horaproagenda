import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/lib/toast';
import { useRef } from 'react';
import { humanizeError } from '@/lib/humanError';

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
  const pendingRequest = useRef<{ payload: string; id: string } | null>(null);

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
    mutationFn: async (sale: Omit<SingleSale, 'id' | 'created_at' | 'updated_at' | 'client' | 'service' | 'payment_method' | 'bank' | 'package'>) => {
      // resolveFinancialDestination is invoked by the official database operation.
      const payload = JSON.stringify(sale);
      if (pendingRequest.current?.payload !== payload) {
        pendingRequest.current = { payload, id: crypto.randomUUID() };
      }
      const request = pendingRequest.current;
      if (!request) throw new Error('Não foi possível preparar a venda.');
      const { data, error } = await supabase.rpc('create_single_sale_atomic', {
        _sale: JSON.parse(payload),
        _request_id: request.id,
      });
      if (error) throw error;
      if (!data || typeof data !== 'object' || Array.isArray(data) || !('id' in data)) {
        throw new Error('A venda não foi confirmada. Atualize a lista antes de tentar novamente.');
      }
      return { saleData: data, clientId: sale.client_id };
    },
    onSuccess: (result) => {
      pendingRequest.current = null;
      // Invalidate all related queries immediately
      const clientId = result.clientId;
      
      // Force immediate refetch of all related data
      queryClient.invalidateQueries({ queryKey: ['single_sales'] });
      queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['service_packages'] });
      queryClient.invalidateQueries({ queryKey: ['client_packages'] });
      queryClient.invalidateQueries({ queryKey: ['client_services'] });
      queryClient.invalidateQueries({ queryKey: ['package_appointments'] });
      queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-sales'] });
      queryClient.invalidateQueries({ queryKey: ['client_credits'] });
      queryClient.invalidateQueries({ queryKey: ['clients_credits'] });
      queryClient.invalidateQueries({ queryKey: ['client'] });
      
      // Also invalidate client-specific package query if we have client_id
      if (clientId) {
        queryClient.invalidateQueries({ queryKey: ['client_packages', clientId] });
        queryClient.invalidateQueries({ queryKey: ['client', clientId] });
      }
      
      toast.success('Venda registrada com sucesso!');
    },
    onError: (error: unknown) => {
      toast.error(humanizeError(error));
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

  // Limpeza definitiva: apaga venda + boletos + pacote + agendamentos + financeiro + caixa
  const purgeSale = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase as any).rpc('purge_single_sale_cascade', { _sale_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['single_sales'] });
      queryClient.invalidateQueries({ queryKey: ['client-sales'] });
      queryClient.invalidateQueries({ queryKey: ['client-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['service_packages'] });
      queryClient.invalidateQueries({ queryKey: ['client_packages'] });
      queryClient.invalidateQueries({ queryKey: ['package_appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client_services'] });
      queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['boleto_installments'] });
      toast.success('Venda removida e fluxo financeiro/agenda sincronizados.');
    },
    onError: (error: any) => {
      toast.error('Erro ao remover venda: ' + (error.message || 'desconhecido'));
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
    purgeSale,
  };
}
