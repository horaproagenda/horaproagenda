import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useResourceAccess } from '@/hooks/useResourceAccess';

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
  const { canUseEquipment } = useResourceAccess();

  const { data: allEquipment = [], isLoading, error } = useQuery({
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

  // O profissional só vê e agenda os equipamentos liberados no seu cadastro.
  const equipment = useMemo(
    () => allEquipment.filter((item) => canUseEquipment(item.id)),
    [allEquipment, canUseEquipment],
  );

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['equipment'] });
  };

  return { equipment, isLoading, error, refetch };
}
