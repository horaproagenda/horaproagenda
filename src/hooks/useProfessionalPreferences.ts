import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ProfessionalPreferences {
  user_id: string;
  opening_time: string | null;
  closing_time: string | null;
  slot_interval: number | null;
  work_saturdays: boolean | null;
  work_sundays: boolean | null;
  saturday_opening_time: string | null;
  saturday_closing_time: string | null;
  sunday_opening_time: string | null;
  sunday_closing_time: string | null;
  timezone: string | null;
  drag_and_drop_enabled: boolean | null;
  auto_complete_appointments: boolean | null;
  automation_whatsapp_reminders: boolean | null;
  automation_waitlist: boolean | null;
  automation_gap_finder: boolean | null;
  automation_occupancy_dashboard: boolean | null;
  automation_smart_recurrence: boolean | null;
  reminder_hours_before: number[] | null;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
}

export interface EffectiveBusinessSettings {
  opening_time: string;
  closing_time: string;
  slot_interval: number;
  work_saturdays: boolean;
  work_sundays: boolean;
  saturday_opening_time: string;
  saturday_closing_time: string;
  sunday_opening_time: string;
  sunday_closing_time: string;
  timezone: string;
  drag_and_drop_enabled: boolean;
  auto_complete_appointments: boolean;
  automation_whatsapp_reminders: boolean;
  automation_waitlist: boolean;
  automation_gap_finder: boolean;
  automation_occupancy_dashboard: boolean;
  automation_smart_recurrence: boolean;
  reminder_hours_before: number[];
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
  has_override: boolean;
  global_id: string;
}

export function useProfessionalPreferences() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: prefs, isLoading } = useQuery({
    queryKey: ['professional-preferences', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<ProfessionalPreferences | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('professional_preferences')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as ProfessionalPreferences | null;
    },
  });

  const { data: effective } = useQuery({
    queryKey: ['effective-business-settings', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<EffectiveBusinessSettings | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('get_effective_business_settings', {
        _user_id: user!.id,
      });
      if (error) throw error;
      const obj = (data ?? {}) as EffectiveBusinessSettings;
      if (obj.opening_time) obj.opening_time = obj.opening_time.substring(0, 5);
      if (obj.closing_time) obj.closing_time = obj.closing_time.substring(0, 5);
      return obj;
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`prefs-${user.id}`)
      .on(
        'postgres_changes',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { event: '*', schema: 'public', table: 'professional_preferences', filter: `user_id=eq.${user.id}` } as any,
        () => {
          qc.invalidateQueries({ queryKey: ['professional-preferences', user.id] });
          qc.invalidateQueries({ queryKey: ['effective-business-settings', user.id] });
          qc.invalidateQueries({ queryKey: ['business-settings'] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, qc]);

  const update = useMutation({
    mutationFn: async (patch: Partial<ProfessionalPreferences>) => {
      if (!user?.id) throw new Error('Sem sessão ativa. Faça login novamente.');
      const payload = { user_id: user.id, ...patch };

      // Timeout de segurança: se o request travar (rede ruim, RLS bloqueando, etc.)
      // abortamos em 15s para o usuário receber feedback claro em vez de spinner eterno.
      const timeoutMs = 15000;
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Tempo esgotado ao salvar (15s). Verifique sua conexão e tente novamente.')), timeoutMs)
      );

      // .select() confirma a persistência: se o servidor não devolver a linha,
      // tratamos como falha em vez de assumir sucesso.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const upsertPromise = (supabase as any)
        .from('professional_preferences')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
        .maybeSingle();

      const { data, error } = await Promise.race([upsertPromise, timeoutPromise]) as any;
      if (error) {
        const msg = error.message || 'Erro desconhecido';
        if (msg.toLowerCase().includes('permission')) {
          throw new Error('Você não tem permissão para salvar essas preferências. Contate o administrador.');
        }
        throw new Error(msg);
      }
      if (!data) throw new Error('Servidor não confirmou o salvamento. Tente novamente.');
      return data;
    },
    retry: (failureCount, error: Error) => {
      // Retry automático apenas para erros de rede transientes (não para permissão/validação).
      const msg = (error?.message || '').toLowerCase();
      const isTransient = msg.includes('network') || msg.includes('fetch') || msg.includes('tempo esgotado');
      return isTransient && failureCount < 2;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['professional-preferences', user?.id] });
      qc.invalidateQueries({ queryKey: ['effective-business-settings', user?.id] });
      qc.invalidateQueries({ queryKey: ['business-settings'] });
      toast.success('Suas preferências foram salvas!');
    },
    onError: (e: Error) => toast.error('Erro ao salvar: ' + e.message, { duration: 6000 }),
  });

  const resetField = (field: keyof ProfessionalPreferences) => {
    update.mutate({ [field]: null } as Partial<ProfessionalPreferences>);
  };

  return { prefs, effective, isLoading, update, resetField };
}
