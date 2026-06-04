import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export interface AccountSubscription {
  id: string;
  owner_user_id: string;
  status: 'trial' | 'active' | 'past_due' | 'canceled' | 'grandfathered';
  trial_ends_at: string | null;
  plan_tier: number | null;
  seat_limit: number;
  is_grandfathered: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  current_period_end: string | null;
}

export function useAccountSubscription() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['account-subscription', user?.id],
    queryFn: async (): Promise<AccountSubscription | null> => {
      if (!user?.id) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('get_my_subscription');
      if (error) {
        console.warn('get_my_subscription error:', error);
        return null;
      }
      // RPC returning a row type comes back as object or null
      return (data && (data.id ? data : Array.isArray(data) ? data[0] : null)) ?? null;
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  // Realtime: invalida ao mudar a assinatura da conta
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`account-sub-${user.id}`)
      .on('postgres_changes',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { event: '*', schema: 'public', table: 'account_subscriptions' } as any,
        () => qc.invalidateQueries({ queryKey: ['account-subscription', user.id] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, qc]);

  const sub = query.data;
  const now = Date.now();
  const trialEndsMs = sub?.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : 0;
  const trialDaysLeft = sub?.status === 'trial'
    ? Math.max(0, Math.ceil((trialEndsMs - now) / (1000 * 60 * 60 * 24)))
    : 0;
  const trialExpired = sub?.status === 'trial' && trialEndsMs < now;
  const hasAccess = !sub
    ? true // ainda carregando — não bloqueia
    : sub.is_grandfathered
      || sub.status === 'active'
      || sub.status === 'grandfathered'
      || (sub.status === 'trial' && !trialExpired);

  return { subscription: sub, trialDaysLeft, trialExpired, hasAccess, isLoading: query.isLoading };
}
