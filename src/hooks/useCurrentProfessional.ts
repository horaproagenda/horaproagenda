import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useCurrentProfessional() {
  const { user, hasRole } = useAuth();
  const isProfessional = hasRole('professional') && !hasRole('admin') && !hasRole('receptionist');

  const { data: professionalId, isLoading } = useQuery({
    queryKey: ['current-professional', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      // 1) Vínculo direto pelo user_id
      const { data: direct, error: directError } = await supabase
        .from('professionals')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!directError && direct?.id) {
        return direct.id;
      }

      // 2) Fallback resiliente: identificar profissional pelo e-mail do perfil/usuário
      try {
        const { data: linkedId } = await supabase.rpc('get_professional_id_by_user_or_email', {
          _user_id: user.id,
        });
        if (linkedId) {
          // Tenta vincular para próximas consultas
          try {
            await supabase.rpc('link_current_user_professional');
          } catch {
            // tudo bem: o usuário ainda consegue operar pelo fallback
          }

          return linkedId as string;
        }
      } catch (rpcError) {
        console.warn('Fallback de profissional indisponível:', rpcError);
      }

      return null;
    },
    enabled: !!user?.id && isProfessional,
    staleTime: 60_000,
  });

  return {
    professionalId: isProfessional ? professionalId : null,
    isProfessional,
    isLoading,
  };
}
