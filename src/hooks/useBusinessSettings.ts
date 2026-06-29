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
  overdue_days_threshold: number;
  // Automation settings
  automation_whatsapp_reminders: boolean;
  automation_waitlist: boolean;
  automation_gap_finder: boolean;
  automation_occupancy_dashboard: boolean;
  automation_smart_recurrence: boolean;
  reminder_hours_before: number[];
  reminder_provider: 'whatsapp' | 'twilio_sms' | 'twilio_whatsapp';
  twilio_from_number: string | null;
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
      // Select non-sensitive columns explicitly. CNPJ and Twilio number
      // are restricted to admin/receptionist via column-level grants and
      // fetched separately through get_sensitive_business_settings RPC.
      const { data, error } = await supabase
        .from('business_settings')
        .select('id, opening_time, closing_time, slot_interval, work_saturdays, work_sundays, saturday_opening_time, saturday_closing_time, sunday_opening_time, sunday_closing_time, drag_and_drop_enabled, auto_complete_appointments, timezone, overdue_days_threshold, automation_whatsapp_reminders, automation_waitlist, automation_gap_finder, automation_occupancy_dashboard, automation_smart_recurrence, reminder_hours_before, reminder_provider, clinic_name, clinic_phone, clinic_address, clinic_email, professional_name, clinic_cep, clinic_street, clinic_number, clinic_complement, clinic_neighborhood, clinic_city, clinic_state, created_at, updated_at')
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      // Try to fetch sensitive fields (only succeeds for admin/receptionist)
      if (data) {
        const { data: sensitive } = await supabase.rpc('get_sensitive_business_settings');
        const row = Array.isArray(sensitive) ? sensitive[0] : sensitive;
        (data as any).clinic_cnpj = row?.clinic_cnpj ?? null;
        (data as any).twilio_from_number = row?.twilio_from_number ?? null;
      }

      // Overlay per-user effective settings (global + professional_preferences)
      if (data) {
        try {
          const { data: eff } = await supabase.rpc('get_effective_business_settings');
          if (eff && typeof eff === 'object') {
            const e = eff as Record<string, any>;
            const overlayKeys = [
              'opening_time','closing_time','slot_interval',
              'work_saturdays','work_sundays',
              'saturday_opening_time','saturday_closing_time',
              'sunday_opening_time','sunday_closing_time',
              'timezone','drag_and_drop_enabled','auto_complete_appointments',
              'automation_whatsapp_reminders','automation_waitlist',
              'automation_gap_finder','automation_occupancy_dashboard',
              'automation_smart_recurrence','reminder_hours_before',
            ];
            overlayKeys.forEach((k) => {
              if (e[k] !== undefined && e[k] !== null) (data as any)[k] = e[k];
            });
            (data as any).has_override = !!e.has_override;
          }
        } catch {
          // If RPC fails, fall back to global settings silently
        }
      }

      // Format time fields to ensure they're in HH:mm format
      if (data) {
        data.opening_time = data.opening_time?.substring(0, 5) || '08:00';
        data.closing_time = data.closing_time?.substring(0, 5) || '20:00';
        data.saturday_opening_time = data.saturday_opening_time?.substring(0, 5) || '08:00';
        data.saturday_closing_time = data.saturday_closing_time?.substring(0, 5) || '18:00';
        data.sunday_opening_time = data.sunday_opening_time?.substring(0, 5) || '08:00';
        data.sunday_closing_time = data.sunday_closing_time?.substring(0, 5) || '18:00';
      }
      
      return data as unknown as BusinessSettings | null;
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

      // Timeout de segurança para evitar spinner eterno em caso de rede travada/RLS.
      const timeoutMs = 15000;
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Tempo esgotado ao salvar (15s). Verifique sua conexão e tente novamente.')), timeoutMs)
      );

      const exec = async () => {
        if (!settings?.id) {
          const { data, error } = await supabase
            .from('business_settings')
            // account_owner_id is auto-filled by a BEFORE INSERT trigger.
            .insert(formattedUpdates as never)
            .select()
            .maybeSingle();
          if (error) throw error;
          if (!data) throw new Error('Servidor não confirmou a criação das configurações.');
          return data;
        }
        const { data, error } = await supabase
          .from('business_settings')
          .update(formattedUpdates)
          .eq('id', settings.id)
          .select()
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Servidor não confirmou o salvamento. Tente novamente.');
        return data;
      };

      try {
        return await Promise.race([exec(), timeoutPromise]);
      } catch (err: any) {
        const msg = (err?.message || '').toLowerCase();
        if (msg.includes('permission')) {
          throw new Error('Você não tem permissão para alterar essas configurações.');
        }
        throw err;
      }
    },
    retry: (failureCount, error: Error) => {
      const msg = (error?.message || '').toLowerCase();
      const isTransient = msg.includes('network') || msg.includes('fetch') || msg.includes('tempo esgotado');
      return isTransient && failureCount < 2;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-settings'] });
      toast.success('Configurações atualizadas!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar configurações: ' + error.message, { duration: 6000 });
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

  // Get business hours for a specific day of the week (0=Sunday, 6=Saturday)
  const getBusinessHoursForDay = (dayOfWeek: number): { open: string; close: string; isOpen: boolean } => {
    if (!settings) return { open: '08:00', close: '20:00', isOpen: dayOfWeek !== 0 };
    
    if (dayOfWeek === 0) {
      return {
        open: settings.sunday_opening_time || '08:00',
        close: settings.sunday_closing_time || '18:00',
        isOpen: settings.work_sundays,
      };
    }
    if (dayOfWeek === 6) {
      return {
        open: settings.saturday_opening_time || '08:00',
        close: settings.saturday_closing_time || '18:00',
        isOpen: settings.work_saturdays,
      };
    }
    return {
      open: settings.opening_time,
      close: settings.closing_time,
      isOpen: true,
    };
  };

  const generateTimeSlotsForDay = (dayOfWeek: number) => {
    const hours = getBusinessHoursForDay(dayOfWeek);
    if (!hours.isOpen) return [];
    return generateSlotsFromRange(hours.open, hours.close, settings?.slot_interval || 30);
  };

  return {
    settings,
    isLoading,
    updateSettings,
    generateTimeSlots,
    generateDetailedTimeSlots,
    generateTimeSlotsForDay,
    getBusinessHoursForDay,
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
