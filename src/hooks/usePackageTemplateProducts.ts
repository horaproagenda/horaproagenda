import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Product } from './useProducts';

export type TrackingMethod = 'exact' | 'estimated';

export interface PackageTemplateProduct {
  id: string;
  template_id: string;
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
  template?: {
    id: string;
    name: string;
    total_sessions: number;
  };
}

export function usePackageTemplateProducts(templateId?: string) {
  const queryClient = useQueryClient();

  const { data: templateProducts = [], isLoading, refetch } = useQuery({
    queryKey: ['package_template_products', templateId],
    queryFn: async () => {
      let query = supabase
        .from('package_template_products')
        .select('*, product:products(*), template:package_templates(id, name, total_sessions)')
        .order('created_at', { ascending: true });

      if (templateId) {
        query = query.eq('template_id', templateId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as PackageTemplateProduct[];
    },
  });

  // Realtime sync — recalcula precificação automaticamente quando produtos
  // vinculados ao template forem alterados em qualquer sessão.
  useEffect(() => {
    const ch = supabase
      .channel('package-template-products-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'package_template_products' }, () => {
        queryClient.invalidateQueries({ queryKey: ['package_template_products'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  const createTemplateProduct = useMutation({
    mutationFn: async (templateProduct: {
      template_id: string;
      product_id: string;
      quantity_per_use?: number;
      estimated_appointments?: number | null;
      container_amount?: number | null;
      container_unit?: string | null;
      tracking_method?: TrackingMethod;
      notes?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('package_template_products')
        .insert({
          template_id: templateProduct.template_id,
          product_id: templateProduct.product_id,
          quantity_per_use: templateProduct.quantity_per_use ?? 1,
          estimated_appointments: templateProduct.estimated_appointments ?? null,
          container_amount: templateProduct.container_amount ?? null,
          container_unit: templateProduct.container_unit ?? null,
          tracking_method: templateProduct.tracking_method ?? 'exact',
          notes: templateProduct.notes ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['package_template_products'] });
      toast.success('Produto vinculado ao template de pacote!');
    },
    onError: (error: any) => {
      toast.error('Erro ao vincular produto: ' + error.message);
    },
  });

  const updateTemplateProduct = useMutation({
    mutationFn: async ({ id, ...data }: Partial<PackageTemplateProduct> & { id: string }) => {
      const { data: result, error } = await supabase
        .from('package_template_products')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['package_template_products'] });
      toast.success('Vínculo atualizado!');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar vínculo: ' + error.message);
    },
  });

  const deleteTemplateProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('package_template_products')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['package_template_products'] });
      toast.success('Vínculo removido!');
    },
    onError: (error: any) => {
      toast.error('Erro ao remover vínculo: ' + error.message);
    },
  });

  return {
    templateProducts,
    isLoading,
    refetch,
    createTemplateProduct,
    updateTemplateProduct,
    deleteTemplateProduct,
  };
}
