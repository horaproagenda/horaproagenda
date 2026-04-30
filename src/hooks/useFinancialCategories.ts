import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface FinancialCategory {
  id: string;
  name: string;
  type: 'income' | 'expense';
  is_recurring: boolean;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useFinancialCategories() {
  const queryClient = useQueryClient();

  // Realtime sync for financial_categories
  useEffect(() => {
    const channel = supabase
      .channel('financial_categories_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_categories' }, () => {
        queryClient.invalidateQueries({ queryKey: ['financial_categories'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: categories = [], isLoading, refetch } = useQuery({
    queryKey: ['financial_categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_categories')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as FinancialCategory[];
    },
  });

  const createCategory = useMutation({
    mutationFn: async (category: Omit<FinancialCategory, 'id' | 'created_at' | 'updated_at'>) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('financial_categories')
        .insert({
          ...category,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial_categories'] });
      toast.success('Categoria criada com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao criar categoria: ' + error.message);
    },
  });

  const updateCategory = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<FinancialCategory> & { id: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('financial_categories')
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
      queryClient.invalidateQueries({ queryKey: ['financial_categories'] });
      toast.success('Categoria atualizada com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar categoria: ' + error.message);
    },
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('financial_categories')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial_categories'] });
      toast.success('Categoria excluída com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao excluir categoria: ' + error.message);
    },
  });

  const activeCategories = categories.filter(c => c.is_active);
  const incomeCategories = activeCategories.filter(c => c.type === 'income');
  const expenseCategories = activeCategories.filter(c => c.type === 'expense');
  const recurringCategories = activeCategories.filter(c => c.is_recurring);

  return {
    categories,
    activeCategories,
    incomeCategories,
    expenseCategories,
    recurringCategories,
    isLoading,
    refetch,
    createCategory,
    updateCategory,
    deleteCategory,
  };
}
