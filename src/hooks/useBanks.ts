import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Bank {
  id: string;
  name: string;
  account_number: string | null;
  agency: string | null;
  bank_code: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useBanks() {
  const queryClient = useQueryClient();

  const { data: banks = [], isLoading, refetch } = useQuery({
    queryKey: ['banks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('banks')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as Bank[];
    },
  });

  const activeBanks = banks.filter(b => b.is_active);

  const createBank = useMutation({
    mutationFn: async (bank: Omit<Bank, 'id' | 'created_at' | 'updated_at'>) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('banks')
        .insert({
          ...bank,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banks'] });
      toast.success('Banco cadastrado com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao cadastrar banco: ' + error.message);
    },
  });

  const updateBank = useMutation({
    mutationFn: async ({ id, ...bank }: Partial<Bank> & { id: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('banks')
        .update({
          ...bank,
          updated_by: user?.id,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banks'] });
      toast.success('Banco atualizado com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar banco: ' + error.message);
    },
  });

  const deleteBank = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('banks')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banks'] });
      toast.success('Banco excluído com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao excluir banco: ' + error.message);
    },
  });

  return {
    banks,
    activeBanks,
    isLoading,
    refetch,
    createBank,
    updateBank,
    deleteBank,
  };
}
