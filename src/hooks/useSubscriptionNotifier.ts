import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { AccountSubscription } from './useAccountSubscription';

/**
 * Escuta mudanças na assinatura da própria conta e dispara toasts contextuais
 * quando o status/trial/grandfathered muda — cobre:
 *  - Baixa manual de pagamento feita pelo Super Admin (status -> active)
 *  - Extensão de trial (trial_ends_at cresce)
 *  - Acesso vitalício concedido (is_grandfathered -> true)
 *  - Pagamento confirmado via Stripe webhook (status trial/past_due/canceled -> active)
 */
export function useSubscriptionNotifier() {
  const { user } = useAuth();
  const previous = useRef<Partial<AccountSubscription> | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!user?.id) return;

    // Load current snapshot first to avoid firing on initial mount
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any).rpc('get_my_subscription');
        const sub = (data && (data.id ? data : Array.isArray(data) ? data[0] : null)) ?? null;
        previous.current = sub;
        initialized.current = true;
      } catch {
        initialized.current = true;
      }
    })();

    const channel = supabase
      .channel(`account-sub-notify-${user.id}`)
      .on(
        'postgres_changes',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'account_subscriptions',
          filter: `owner_user_id=eq.${user.id}`,
        } as any,
        (payload: { new: AccountSubscription; old: Partial<AccountSubscription> }) => {
          if (!initialized.current) return;
          const next = payload.new;
          const prev = previous.current ?? payload.old ?? {};
          previous.current = next;

          const prevStatus = prev.status;
          const prevTrial = prev.trial_ends_at ? new Date(prev.trial_ends_at).getTime() : 0;
          const nextTrial = next.trial_ends_at ? new Date(next.trial_ends_at).getTime() : 0;
          const prevPeriodEnd = prev.current_period_end ? new Date(prev.current_period_end).getTime() : 0;
          const nextPeriodEnd = next.current_period_end ? new Date(next.current_period_end).getTime() : 0;

          // Acesso vitalício
          if (!prev.is_grandfathered && next.is_grandfathered) {
            toast.success('Acesso vitalício concedido', {
              description: 'Sua conta está liberada permanentemente. Aproveite!',
              duration: 8000,
            });
            return;
          }

          // Pagamento (manual ou Stripe) — status virou active OU período pago aumentou
          if (
            (prevStatus !== 'active' && next.status === 'active') ||
            (next.status === 'active' && nextPeriodEnd > prevPeriodEnd && prevPeriodEnd > 0)
          ) {
            const dt = next.current_period_end
              ? new Date(next.current_period_end).toLocaleDateString('pt-BR')
              : null;
            toast.success('Pagamento confirmado', {
              description: dt ? `Sua assinatura está ativa até ${dt}.` : 'Sua assinatura está ativa.',
              duration: 8000,
            });
            return;
          }

          // Trial estendido
          if (next.status === 'trial' && nextTrial > prevTrial && prevTrial > 0) {
            const extraDays = Math.round((nextTrial - prevTrial) / 86400000);
            const dt = new Date(nextTrial).toLocaleDateString('pt-BR');
            toast.success('Período de teste estendido', {
              description: `+${extraDays} dia(s). Novo término em ${dt}.`,
              duration: 8000,
            });
            return;
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);
}
