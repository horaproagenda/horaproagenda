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
      return data as Professional[];
    },
    enabled: !!accountOwnerId,
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['professionals'] });
  };

  return { professionals, isLoading, error, refetch };
}