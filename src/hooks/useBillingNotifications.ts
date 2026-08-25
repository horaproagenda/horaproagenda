import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/lib/toast';

interface BillingNotificationRow {
  title?: string;
  message?: string;
  type?: string;
}

const SUCCESS_TYPES = new Set([
  'payment_succeeded',
  'trial_started',
  'subscription_created',
]);

/**
 * Avisos de cobrança em tempo real: o webhook do Asaas grava em
 * public.notifications (pagamento confirmado, falha, suspensão, reativação)
 * e este hook mostra o aviso na hora para o administrador logado — sem
 * precisar recarregar a página.
 */
export function useBillingNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`billing-notifications-${user.id}`)
      .on(
        'postgres_changes',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` } as any,
        (payload) => {
          const n = (payload.new ?? {}) as BillingNotificationRow;
          const text = n.title && n.message
            ? `${n.title}: ${n.message}`
            : n.message || n.title || 'Atualização da sua assinatura.';
          if (n.type && SUCCESS_TYPES.has(n.type)) toast.success(text);
          else toast.error(text);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);
}
