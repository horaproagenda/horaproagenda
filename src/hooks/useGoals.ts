import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useEffect, useCallback } from 'react';

export interface Goal {
  id: string;
  name: string;
  description: string | null;
  type: 'appointments' | 'revenue' | 'service_appointments';
  target_value: number;
  current_value: number;
  service_id: string | null;
  start_date: string;
  end_date: string;
  status: 'active' | 'completed' | 'cancelled';
  is_active: boolean;
  created_at: string;
  updated_at: string;
  service?: {
    id: string;
    name: string;
  } | null;
}

export interface CreateGoalInput {
  name: string;
  description?: string;
  type: 'appointments' | 'revenue' | 'service_appointments';
  target_value: number;
  service_id?: string;
  start_date: string;
  end_date: string;
}

export function useGoals() {
  const queryClient = useQueryClient();
  const accountOwnerId = useAccountOwnerId();

  // Set up real-time subscriptions for automatic updates (tenant-scoped)
  useEffect(() => {
    if (!accountOwnerId) return;

    const appointmentsChannel = supabase
      .channel(`goals-appointments-sync-${accountOwnerId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'appointments'
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['goals'] });
      })
      .subscribe();

    const salesChannel = supabase
      .channel(`goals-sales-sync-${accountOwnerId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'single_sales'
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['goals'] });
      })
      .subscribe();

    const transactionsChannel = supabase
      .channel(`goals-transactions-sync-${accountOwnerId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cash_transactions'
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['goals'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(appointmentsChannel);
      supabase.removeChannel(salesChannel);
      supabase.removeChannel(transactionsChannel);
    };
  }, [queryClient, accountOwnerId]);

  const { data: goals = [], isLoading, refetch } = useQuery({
    queryKey: ['goals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('goals')
        .select(`
          *,
          service:services(id, name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Goal[];
    }
  });

  const createGoal = useMutation({
    mutationFn: async (input: CreateGoalInput) => {
      const { data, error } = await supabase
        .from('goals')
        .insert({
          name: input.name,
          description: input.description || null,
          type: input.type,
          target_value: input.target_value,
          service_id: input.service_id || null,
          start_date: input.start_date,
          end_date: input.end_date,
          current_value: 0,
          status: 'active',
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      toast.success('Meta criada com sucesso!');
    },
    onError: (error) => {
      console.error('Error creating goal:', error);
      toast.error('Erro ao criar meta');
    }
  });

  const updateGoal = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Goal> & { id: string }) => {
      const { data, error } = await supabase
        .from('goals')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      toast.success('Meta atualizada!');
    },
    onError: (error) => {
      console.error('Error updating goal:', error);
      toast.error('Erro ao atualizar meta');
    }
  });

  const deleteGoal = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('goals')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      toast.success('Meta excluída!');
    },
    onError: (error) => {
      console.error('Error deleting goal:', error);
      toast.error('Erro ao excluir meta');
    }
  });

  // Calculate current values for goals based on real data from appointments, single_sales, and cash_transactions
  const calculateGoalProgress = useCallback(async (goal: Goal): Promise<number> => {
    const startDate = goal.start_date;
    const endDate = goal.end_date;

    if (goal.type === 'appointments') {
      // Count all completed appointments in date range
      const { count, error } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .gte('start_time', startDate)
        .lte('start_time', `${endDate}T23:59:59`)
        .eq('status', 'completed');

      if (error) {
        console.error('Error calculating appointments:', error);
        return 0;
      }
      return count || 0;
    }

    if (goal.type === 'service_appointments' && goal.service_id) {
      // Count completed appointments for specific service
      const { count, error } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('service_id', goal.service_id)
        .gte('start_time', startDate)
        .lte('start_time', `${endDate}T23:59:59`)
        .eq('status', 'completed');

      if (error) {
        console.error('Error calculating service appointments:', error);
        return 0;
      }
      return count || 0;
    }

    if (goal.type === 'revenue') {
      // Sum revenue from completed appointments (amount_paid)
      const { data: appointmentsData, error: appError } = await supabase
        .from('appointments')
        .select('amount_paid')
        .gte('start_time', startDate)
        .lte('start_time', `${endDate}T23:59:59`)
        .eq('status', 'completed');

      // Sum revenue from single_sales (final_amount)
      const { data: salesData, error: salesError } = await supabase
        .from('single_sales')
        .select('final_amount')
        .gte('sale_date', startDate)
        .lte('sale_date', endDate);

      // Sum revenue from cash_transactions (income type only)
      const { data: transactionsData, error: transError } = await supabase
        .from('cash_transactions')
        .select('amount')
        .eq('type', 'income')
        .gte('created_at', startDate)
        .lte('created_at', `${endDate}T23:59:59`);

      if (appError) console.error('Error fetching appointments revenue:', appError);
      if (salesError) console.error('Error fetching sales revenue:', salesError);
      if (transError) console.error('Error fetching transactions revenue:', transError);

      const appointmentsRevenue = appointmentsData?.reduce((sum, a) => sum + (a.amount_paid || 0), 0) || 0;
      const salesRevenue = salesData?.reduce((sum, s) => sum + (s.final_amount || 0), 0) || 0;
      
      // Note: We use appointments + sales as they represent actual client payments
      // Cash transactions might have duplicates if already counted in appointments/sales
      return appointmentsRevenue + salesRevenue;
    }

    return 0;
  }, []);

  return {
    goals,
    isLoading,
    refetch,
    createGoal,
    updateGoal,
    deleteGoal,
    calculateGoalProgress
  };
}
