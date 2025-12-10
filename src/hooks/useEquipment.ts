import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Equipment {
  id: string;
  name: string;
  description: string | null;
  serial_number: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useEquipment() {
  const queryClient = useQueryClient();

  const { data: equipment = [], isLoading, error } = useQuery({
    queryKey: ['equipment'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .order('name', { ascending: true });
      
      if (error) throw error;
      return data as Equipment[];
    },
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['equipment'] });
  };

  return { equipment, isLoading, error, refetch };
}
