import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Professional } from '@/types';

export function useProfessionals() {
  const queryClient = useQueryClient();

  const { data: professionals = [], isLoading, error } = useQuery({
    queryKey: ['professionals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professionals')
        .select('*')
        .order('name', { ascending: true });
      
      if (error) throw error;
      return data as Professional[];
    },
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['professionals'] });
  };

  return { professionals, isLoading, error, refetch };
}