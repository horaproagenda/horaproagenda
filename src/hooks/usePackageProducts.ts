import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Product } from './useProducts';

export type TrackingMethod = 'exact' | 'estimated';

export interface PackageProduct {
  id: string;
  package_id: string;
  product_id: string;
  quantity_per_use: number;
  estimated_appointments: number | null;
  container_amount: number | null;
  container_unit: string | null;
  tracking_method: TrackingMethod;
  notes: string | null;
  created_at: string;
  updated_at: string;
  product?: Product;
  package?: {
    id: string;
    name: string;
    total_sessions: number;
    client_id: string | null;
  };
}

export function usePackageProducts(packageId?: string) {
  const queryClient = useQueryClient();

  const { data: packageProducts = [], isLoading, refetch } = useQuery({
    queryKey: ['package_products', packageId],
    queryFn: async () => {
      let query = supabase
        .from('package_products')
        .select('*, product:products(*), package:service_packages(id, name, total_sessions, client_id)')
        .order('created_at', { ascending: true });

      if (packageId) {
        query = query.eq('package_id', packageId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as PackageProduct[];
    },
  });

  const createPackageProduct = useMutation({
    mutationFn: async (packageProduct: {
      package_id: string;
      product_id: string;
      quantity_per_use?: number;
      estimated_appointments?: number | null;
      container_amount?: number | null;
      container_unit?: string | null;
      tracking_method?: TrackingMethod;
      notes?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('package_products')
        .insert({
          package_id: packageProduct.package_id,
          product_id: packageProduct.product_id,
          quantity_per_use: packageProduct.quantity_per_use ?? 1,
          estimated_appointments: packageProduct.estimated_appointments ?? null,
          container_amount: packageProduct.container_amount ?? null,
          container_unit: packageProduct.container_unit ?? null,
          tracking_method: packageProduct.tracking_method ?? 'exact',
          notes: packageProduct.notes ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['package_products'] });
      toast.success('Produto vinculado ao pacote!');
    },
    onError: (error: any) => {
      toast.error('Erro ao vincular produto: ' + error.message);
    },
  });

  const updatePackageProduct = useMutation({
    mutationFn: async ({ id, ...data }: Partial<PackageProduct> & { id: string }) => {
      const { data: result, error } = await supabase
        .from('package_products')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['package_products'] });
      toast.success('Vínculo atualizado!');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar vínculo: ' + error.message);
    },
  });

  const deletePackageProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('package_products')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['package_products'] });
      toast.success('Vínculo removido!');
    },
    onError: (error: any) => {
      toast.error('Erro ao remover vínculo: ' + error.message);
    },
  });

  return {
    packageProducts,
    isLoading,
    refetch,
    createPackageProduct,
    updatePackageProduct,
    deletePackageProduct,
  };
}
