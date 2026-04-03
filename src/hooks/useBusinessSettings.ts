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
  saturday_opening_time: string;
  saturday_closing_time: string;
  sunday_opening_time: string;
  sunday_closing_time: string;
  drag_and_drop_enabled: boolean;
  auto_complete_appointments: boolean;
  timezone: string;
  // Automation settings
  automation_whatsapp_reminders: boolean;
  automation_waitlist: boolean;
  automation_gap_finder: boolean;
  automation_occupancy_dashboard: boolean;
  automation_smart_recurrence: boolean;
  created_at: string;
  updated_at: string;
}

export const BRAZIL_TIMEZONES = [
  { value: 'America/Sao_Paulo', label: 'Brasília (UTC-3)', description: 'SP, RJ, MG, RS, SC, PR, ES, GO, DF' },
  { value: 'America/Fortaleza', label: 'Fortaleza (UTC-3)', description: 'CE, RN, PB, PI, MA, AL, SE' },
  { value: 'America/Recife', label: 'Recife (UTC-3)', description: 'PE' },
  { value: 'America/Bahia', label: 'Salvador (UTC-3)', description: 'BA' },
  { value: 'America/Belem', label: 'Belém (UTC-3)', description: 'PA (leste), AP, TO' },
  { value: 'America/Manaus', label: 'Manaus (UTC-4)', description: 'AM (leste), RO, MT, MS' },
  { value: 'America/Cuiaba', label: 'Cuiabá (UTC-4)', description: 'MT' },
  { value: 'America/Porto_Velho', label: 'Porto Velho (UTC-4)', description: 'RO' },
  { value: 'America/Boa_Vista', label: 'Boa Vista (UTC-4)', description: 'RR' },
  { value: 'America/Rio_Branco', label: 'Rio Branco (UTC-5)', description: 'AC, AM (oeste)' },
  { value: 'America/Noronha', label: 'Fernando de Noronha (UTC-2)', description: 'Arquipélago' },
];

export function useBusinessSettings() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['business-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_settings')
        .select('*')
        .limit(1)
        .single();

      if (error) throw error;
      
      // Format time fields to ensure they're in HH:mm format
      if (data) {
        data.opening_time = data.opening_time?.substring(0, 5) || '08:00';
        data.closing_time = data.closing_time?.substring(0, 5) || '20:00';
        data.saturday_opening_time = data.saturday_opening_time?.substring(0, 5) || '08:00';
        data.saturday_closing_time = data.saturday_closing_time?.substring(0, 5) || '18:00';
        data.sunday_opening_time = data.sunday_opening_time?.substring(0, 5) || '08:00';
        data.sunday_closing_time = data.sunday_closing_time?.substring(0, 5) || '18:00';
      }
      
      return data as BusinessSettings | null;
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<BusinessSettings>) => {
      // Format time fields if present
      const formattedUpdates = { ...updates };
      const timeFields = ['opening_time', 'closing_time', 'saturday_opening_time', 'saturday_closing_time', 'sunday_opening_time', 'sunday_closing_time'] as const;
      timeFields.forEach(field => {
        const val = formattedUpdates[field];
        if (val && typeof val === 'string' && val.length === 5) {
          (formattedUpdates as any)[field] = val + ':00';
        }
      });
      
      if (!settings?.id) {
        // Create settings if they don't exist
        const { data, error } = await supabase
          .from('business_settings')
          .insert(formattedUpdates)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      
      const { data, error } = await supabase
        .from('business_settings')
        .update(formattedUpdates)
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

  // Generate fine-grained slots (always 15min) for appointment matching
  const generateDetailedTimeSlots = () => {
    if (!settings) {
      return generateSlotsFromRange('08:00', '20:00', 15);
    }
    return generateSlotsFromRange(settings.opening_time, settings.closing_time, 15);
  };

  return {
    settings,
    isLoading,
    updateSettings,
    generateTimeSlots,
    generateDetailedTimeSlots,
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
