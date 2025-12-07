import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Room } from '@/types';

export function useRooms() {
  const queryClient = useQueryClient();

  const { data: rooms = [], isLoading, error } = useQuery({
    queryKey: ['rooms'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .order('name', { ascending: true });
      
      if (error) throw error;
      return data as Room[];
    },
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['rooms'] });
  };

  return { rooms, isLoading, error, refetch };
}