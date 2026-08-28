import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export interface Reminder {
  id: string;
  title: string;
  description: string | null;
  reminder_date: string | null;
  reminder_time: string | null;
  is_recurring: boolean;
  recurring_frequency: string | null;
  recurring_days: number[] | null;
  is_active: boolean;
  is_completed: boolean;
  completed_at: string | null;
  category: string | null;
  priority: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export function useReminders() {
  const queryClient = useQueryClient();
  const { user, hasRole } = useAuth();
  // A página de Lembretes está disponível para todos os usuários, porém cada
  // profissional trabalha apenas com os lembretes que criou. Administrador e
  // recepção continuam vendo os lembretes de toda a equipe.
  const seesAll = hasRole('admin') || hasRole('receptionist');

  const { data: allReminders = [], isLoading, refetch } = useQuery({
    queryKey: ['reminders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .order('reminder_date', { ascending: true, nullsFirst: false })
        .order('reminder_time', { ascending: true, nullsFirst: false });

      if (error) throw error;
      return data as Reminder[];
    },
  });

  const reminders = useMemo(() => {
    if (seesAll || !user?.id) return allReminders;
    return allReminders.filter((r) => !r.created_by || r.created_by === user.id);
  }, [allReminders, seesAll, user?.id]);

  const createReminder = useMutation({
    mutationFn: async (reminder: Omit<Reminder, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by' | 'completed_at'>) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('reminders')
        .insert({
          ...reminder,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      toast.success('Lembrete criado com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao criar lembrete: ' + error.message);
    },
  });

  const updateReminder = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Reminder> & { id: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('reminders')
        .update({
          ...updates,
          updated_by: user?.id,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      toast.success('Lembrete atualizado!');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar lembrete: ' + error.message);
    },
  });

  const completeReminder = useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('reminders')
        .update({
          is_completed: true,
          completed_at: new Date().toISOString(),
          updated_by: user?.id,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      toast.success('Lembrete concluído!');
    },
    onError: (error: any) => {
      toast.error('Erro ao concluir lembrete: ' + error.message);
    },
  });

  const deleteReminder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('reminders')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      toast.success('Lembrete excluído!');
    },
    onError: (error: any) => {
      toast.error('Erro ao excluir lembrete: ' + error.message);
    },
  });

  // Filter helpers
  const activeReminders = reminders.filter(r => r.is_active && !r.is_completed);
  const completedReminders = reminders.filter(r => r.is_completed);
  const todayReminders = reminders.filter(r => {
    if (!r.reminder_date || r.is_completed) return false;
    const today = new Date().toISOString().split('T')[0];
    return r.reminder_date === today;
  });

  return {
    reminders,
    activeReminders,
    completedReminders,
    todayReminders,
    isLoading,
    refetch,
    createReminder,
    updateReminder,
    completeReminder,
    deleteReminder,
  };
}
