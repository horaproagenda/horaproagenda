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
        const ar = a as unknown as { user_id?: string | null; account_owner_id?: string | null };
        const br = b as unknown as { user_id?: string | null; account_owner_id?: string | null };
        const aIsAdmin = ar.user_id && ar.user_id === ar.account_owner_id ? 0 : 1;
        const bIsAdmin = br.user_id && br.user_id === br.account_owner_id ? 0 : 1;
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