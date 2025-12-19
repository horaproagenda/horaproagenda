import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Hook para sincronização em tempo real entre tabelas
 * Sincroniza automaticamente status de pagamento entre vendas e agendamentos
 * Mostra notificações em tempo real
 */
export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Canal para sincronizar todas as tabelas principais
    const mainChannel = supabase
      .channel('realtime-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'single_sales'
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['appointments'] });
          queryClient.invalidateQueries({ queryKey: ['client_services'] });
          queryClient.invalidateQueries({ queryKey: ['client-sales'] });
          queryClient.invalidateQueries({ queryKey: ['sales'] });
          queryClient.invalidateQueries({ queryKey: ['clients'] });
          queryClient.invalidateQueries({ queryKey: ['client'] });
          
          if (payload.eventType === 'INSERT') {
            toast.success('Nova venda registrada!', { duration: 3000 });
          }
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
          queryClient.invalidateQueries({ queryKey: ['client_services'] });
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
          queryClient.invalidateQueries({ queryKey: ['service_packages'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments'
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['appointments'] });
          queryClient.invalidateQueries({ queryKey: ['client-appointments'] });
          
          if (payload.eventType === 'INSERT') {
            toast.success('Novo agendamento criado!', { duration: 3000 });
          } else if (payload.eventType === 'UPDATE') {
            const newData = payload.new as { payment_status?: string };
            if (newData.payment_status === 'paid') {
              toast.success('Pagamento confirmado!', { duration: 3000 });
            }
          }
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clients'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['clients'] });
          queryClient.invalidateQueries({ queryKey: ['client'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'financial_entries'
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
          
          if (payload.eventType === 'INSERT') {
            toast.info('Nova entrada financeira registrada', { duration: 2000 });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['products'] });
          queryClient.invalidateQueries({ queryKey: ['service_products'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'product_purchases'
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['product_purchases'] });
          queryClient.invalidateQueries({ queryKey: ['products'] });
          queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
          queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
          
          if (payload.eventType === 'INSERT') {
            toast.info('Nova compra de produto registrada', { duration: 2000 });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(mainChannel);
    };
  }, [queryClient]);
}
