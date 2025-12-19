import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook para sincronização em tempo real entre tabelas
 * Sincroniza automaticamente status de pagamento entre vendas e agendamentos
 */
export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Canal para sincronizar vendas com agendamentos
    const salesChannel = supabase
      .channel('sales-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'single_sales'
        },
        () => {
          // Invalidar queries relacionadas de forma eficiente
          queryClient.invalidateQueries({ queryKey: ['appointments'] });
          queryClient.invalidateQueries({ queryKey: ['client_services'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_services'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['appointments'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_packages'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['appointments'] });
          queryClient.invalidateQueries({ queryKey: ['client_packages'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['appointments'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cash_transactions'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
          queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(salesChannel);
    };
  }, [queryClient]);
}
