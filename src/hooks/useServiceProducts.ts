import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Product } from './useProducts';
import type { Service } from '@/types';

export interface ServiceProduct {
  id: string;
  service_id: string;
  product_id: string;
  quantity_per_use: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  product?: Product;
  service?: Service;
}

export function useServiceProducts(serviceId?: string) {
  const queryClient = useQueryClient();

  const { data: serviceProducts = [], isLoading, refetch } = useQuery({
    queryKey: ['service_products', serviceId],
    queryFn: async () => {
      let query = supabase
        .from('service_products')
        .select('*, product:products(*), service:services(*)')
        .order('created_at', { ascending: true });

      if (serviceId) {
        query = query.eq('service_id', serviceId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as ServiceProduct[];
    },
  });

  const createServiceProduct = useMutation({
    mutationFn: async (serviceProduct: Omit<ServiceProduct, 'id' | 'created_at' | 'updated_at' | 'product' | 'service'>) => {
      const { data, error } = await supabase
        .from('service_products')
        .insert(serviceProduct)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service_products'] });
      toast.success('Produto vinculado ao serviço!');
    },
    onError: (error: any) => {
      toast.error('Erro ao vincular produto: ' + error.message);
    },
  });

  const updateServiceProduct = useMutation({
    mutationFn: async ({ id, ...data }: Partial<ServiceProduct> & { id: string }) => {
      const { data: result, error } = await supabase
        .from('service_products')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service_products'] });
      toast.success('Vínculo atualizado!');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar vínculo: ' + error.message);
    },
  });

  const deleteServiceProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('service_products')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service_products'] });
      toast.success('Vínculo removido!');
    },
    onError: (error: any) => {
      toast.error('Erro ao remover vínculo: ' + error.message);
    },
  });

  return {
    serviceProducts,
    isLoading,
    refetch,
    createServiceProduct,
    updateServiceProduct,
    deleteServiceProduct,
  };
}
