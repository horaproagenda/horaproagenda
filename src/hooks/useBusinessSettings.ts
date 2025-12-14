import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface BusinessSettings {
  id: string;
  opening_time: string;
  closing_time: string;
  slot_interval: number;
  work_saturdays: boolean;
  work_sundays: boolean;
  drag_and_drop_enabled: boolean;
  auto_complete_appointments: boolean;
  created_at: string;
  updated_at: string;
}

export function useBusinessSettings() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['business-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_settings')
        .select('*')
        .maybeSingle();

      if (error) throw error;
      return data as BusinessSettings | null;
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<BusinessSettings>) => {
      if (!settings?.id) throw new Error('Settings not found');
      
      const { data, error } = await supabase
        .from('business_settings')
        .update(updates)
        .eq('id', settings.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-settings'] });
      toast.success('Configurações atualizadas!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar configurações: ' + error.message);
    },
  });

  // Generate time slots based on settings
  const generateTimeSlots = () => {
    if (!settings) {
      // Default slots
      return generateSlotsFromRange('08:00', '20:00', 30);
    }
    return generateSlotsFromRange(settings.opening_time, settings.closing_time, settings.slot_interval);
  };

  return {
    settings,
    isLoading,
    updateSettings,
    generateTimeSlots,
  };
}

function generateSlotsFromRange(start: string, end: string, interval: number): string[] {
  const slots: string[] = [];
  const [startHour, startMin] = start.split(':').map(Number);
  const [endHour, endMin] = end.split(':').map(Number);
  
  let currentHour = startHour;
  let currentMin = startMin;
  
  while (currentHour < endHour || (currentHour === endHour && currentMin < endMin)) {
    slots.push(`${currentHour.toString().padStart(2, '0')}:${currentMin.toString().padStart(2, '0')}`);
    
    currentMin += interval;
    if (currentMin >= 60) {
      currentHour += Math.floor(currentMin / 60);
      currentMin = currentMin % 60;
    }
  }
  
  return slots;
}
