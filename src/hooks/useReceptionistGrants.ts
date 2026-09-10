import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAccountOwnerId } from '@/hooks/useAccountOwnerId';

/**
 * Profissionais que uma recepcionista pode dar baixa. A lista é configurada pelo
 * administrador no cadastro do profissional e aplicada também no banco (RLS).
 */
export function useReceptionistGrants(receptionistProfessionalId: string | null) {
  const queryClient = useQueryClient();
  const accountOwnerId = useAccountOwnerId();

  const { data: grantedIds = [], isLoading } = useQuery({
    queryKey: ['receptionist-grants', receptionistProfessionalId],
    enabled: !!receptionistProfessionalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receptionist_professional_grants')
        .select('professional_id')
        .eq('receptionist_professional_id', receptionistProfessionalId!);
      if (error) throw error;
      return (data ?? []).map((row) => row.professional_id as string);
    },
  });

  const save = async (receptionist: string, professionalIds: string[]) => {
    const { error: delError } = await supabase
      .from('receptionist_professional_grants')
      .delete()
      .eq('receptionist_professional_id', receptionist);
    if (delError) throw delError;

    if (professionalIds.length > 0) {
      if (!accountOwnerId) throw new Error('Conta não identificada.');
      const { error } = await supabase.from('receptionist_professional_grants').insert(
        professionalIds.map((professional_id) => ({
          receptionist_professional_id: receptionist,
          professional_id,
          account_owner_id: accountOwnerId,
        })),
      );
      if (error) throw error;
    }
    queryClient.invalidateQueries({ queryKey: ['receptionist-grants'] });
  };

  return { grantedIds, isLoading, save };
}
