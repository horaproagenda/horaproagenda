import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Professional } from '@/types';
import { useAccountOwnerId } from './useAccountOwnerId';

export function useProfessionals() {
  const queryClient = useQueryClient();
  const accountOwnerId = useAccountOwnerId();

  const { data: professionals = [], isLoading, error } = useQuery({
    queryKey: ['professionals', accountOwnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professionals')
        .select('*')
        .eq('account_owner_id', accountOwnerId)
        .order('name', { ascending: true });

      if (error) throw error;
      // Admin (owner) profissional sempre aparece primeiro na lista
      const list = (data as Professional[]) ?? [];
      list.sort((a, b) => {
        const aIsAdmin = a.user_id && a.user_id === a.account_owner_id ? 0 : 1;
        const bIsAdmin = b.user_id && b.user_id === b.account_owner_id ? 0 : 1;
        if (aIsAdmin !== bIsAdmin) return aIsAdmin - bIsAdmin;
        return (a.name ?? '').localeCompare(b.name ?? '', 'pt-BR');
      });
      return list;
    },
    enabled: !!accountOwnerId,
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['professionals'] });
  };

  return { professionals, isLoading, error, refetch };
}