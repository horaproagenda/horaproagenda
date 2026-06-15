import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAccountOwnerId } from '@/hooks/useAccountOwnerId';
import { useEffect } from 'react';

export interface ProfessionalAbsence {
  id: string;
  professional_id: string;
  start_time: string;
  end_time: string;
  reason: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  professional?: {
    id: string;
    name: string;
    agenda_color: string | null;
  };
}

export interface AbsenceInsert {
  professional_id: string;
  start_time: string;
  end_time: string;
  reason?: string;
  notes?: string;
}

export function useProfessionalAbsences() {
  const queryClient = useQueryClient();

  const { data: absences = [], isLoading } = useQuery({
    queryKey: ['professional-absences'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professional_absences')
        .select(`
          *,
          professional:professionals(id, name, agenda_color)
        `)
        .order('start_time', { ascending: true });

      if (error) throw error;
      return data as ProfessionalAbsence[];
    },
  });

  const createAbsence = useMutation({
    mutationFn: async (absence: AbsenceInsert) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('professional_absences')
        .insert({
          ...absence,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['professional-absences'] });
      toast.success('Ausência registrada com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao registrar ausência: ' + error.message);
    },
  });

  const updateAbsence = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<AbsenceInsert> }) => {
      const { data, error } = await supabase
        .from('professional_absences')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['professional-absences'] });
      toast.success('Ausência atualizada!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar ausência: ' + error.message);
    },
  });

  const deleteAbsence = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('professional_absences')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['professional-absences'] });
      toast.success('Ausência removida!');
    },
    onError: (error) => {
      toast.error('Erro ao remover ausência: ' + error.message);
    },
  });

  // Real-time sync for absences - invalidate appointments when absences change (tenant-scoped)
  const accountOwnerId = useAccountOwnerId();
  useEffect(() => {
    if (!accountOwnerId) return;
    const channel = supabase
      .channel(`absences-appointments-sync-${accountOwnerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'professional_absences' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['professional-absences'] });
          queryClient.invalidateQueries({ queryKey: ['appointments'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, accountOwnerId]);

  return {
    absences,
    isLoading,
    createAbsence,
    updateAbsence,
    deleteAbsence,
  };
}
