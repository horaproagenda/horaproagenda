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
      
      const { data, error } = await supabase
        .from('professionals')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching professional:', error);
        return null;
      }
      
      return data?.id || null;
    },
    enabled: !!user?.id && isProfessional,
  });

  return {
    professionalId: isProfessional ? professionalId : null,
    isProfessional,
    isLoading,
  };
}
