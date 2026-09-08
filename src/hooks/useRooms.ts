import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Room } from '@/types';
import { useResourceAccess } from '@/hooks/useResourceAccess';

export function useRooms() {
  const queryClient = useQueryClient();
  const { canUseRoom } = useResourceAccess();

  const { data: allRooms = [], isLoading, error } = useQuery({
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

  // O profissional só vê e agenda as salas liberadas no seu cadastro.
  const rooms = useMemo(() => allRooms.filter((room) => canUseRoom(room.id)), [allRooms, canUseRoom]);

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['rooms'] });
  };

  return { rooms, isLoading, error, refetch };
}
