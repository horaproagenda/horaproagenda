import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Detecta se o owner ainda não completou o onboarding inicial.
 * Critério: existe `business_settings` para a conta E `onboarding_completed_at IS NULL`.
 * Para contas novas (sem registro), o trigger BEFORE INSERT cria o registro
 * na primeira gravação — mas na primeira sessão talvez não exista ainda.
 * Nesse caso também consideramos onboarding pendente.
 */
export function useOnboardingStatus() {
  const { user, hasRole } = useAuth();
  const queryClient = useQueryClient();

  const isAdmin = hasRole('admin');

  const { data, isLoading } = useQuery({
    queryKey: ['onboarding-status', user?.id],
    enabled: !!user && isAdmin,
    queryFn: async () => {
      const { data: settings } = await supabase
        .from('business_settings')
        .select('id, onboarding_completed_at, clinic_name')
        .limit(1)
        .maybeSingle();

      const { count: profCount } = await supabase
        .from('professionals')
        .select('id', { count: 'exact', head: true });

      const { count: svcCount } = await supabase
        .from('services')
        .select('id', { count: 'exact', head: true });

      const completed = !!(settings as any)?.onboarding_completed_at;
      const hasInitialData = (profCount ?? 0) > 0 && (svcCount ?? 0) > 0;

      return {
        settingsId: settings?.id ?? null,
        completed,
        // Esconde wizard se já há dados (conta antiga) — marca como concluído implicitamente
        shouldShow: !completed && !hasInitialData,
        clinicName: (settings as any)?.clinic_name ?? '',
      };
    },
    staleTime: 1000 * 60 * 5,
  });

  const markCompleted = async () => {
    try {
      // Garante existência do registro e marca o timestamp.
      const { data: existing } = await supabase
        .from('business_settings')
        .select('id')
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        await supabase
          .from('business_settings')
          .update({ onboarding_completed_at: new Date().toISOString() } as any)
          .eq('id', existing.id);
      } else {
        await supabase
          .from('business_settings')
          .insert({ onboarding_completed_at: new Date().toISOString() } as any);
      }
    } finally {
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
      queryClient.invalidateQueries({ queryKey: ['business-settings'] });
    }
  };

  return {
    isLoading,
    shouldShow: !!data?.shouldShow,
    completed: !!data?.completed,
    markCompleted,
  };
}
