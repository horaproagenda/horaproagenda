import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SUBSCRIPTION_SYNC_KEY } from '@/lib/stripeCheckout';
import { getGraceDaysLeft, getPaymentPhase, hasSubscriptionAccess } from '@/lib/subscriptionAccess';




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

  // Revalida ao voltar o foco e quando outra aba avisa que a assinatura mudou
  // (retorno do Stripe Checkout / Portal em outra aba).
  useEffect(() => {
    if (!user?.id) return;
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ['account-subscription', user.id] });
      qc.invalidateQueries({ queryKey: ['seat-usage', user.id] });
    };
    const onFocus = () => { if (document.visibilityState !== 'hidden') refresh(); };
    const onStorage = (e: StorageEvent) => {
      if (e.key === SUBSCRIPTION_SYNC_KEY) refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('storage', onStorage);
    };
  }, [user?.id, qc]);

  // Auto-heal: o webhook do Stripe pode não estar entregando eventos. Se a
  // assinatura local não estiver ativa, sincronizamos direto com o Stripe via
  // check-subscription (throttle de 60s) e revalidamos. Assim, quem já pagou
  // deixa de ver a cobrança sem precisar de nenhuma ação manual.
  const lastSyncRef = useRef(0);
  useEffect(() => {
    if (!user?.id) return;
    const sub = query.data;
    if (query.isLoading) return;
    const trialEnds = sub?.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : 0;
    const looksInactive =
      !sub ||
      (!sub.is_grandfathered &&
        sub.status !== 'grandfathered' &&
        sub.status !== 'active' &&
        !(sub.status === 'trial' && trialEnds > Date.now()));
    if (!looksInactive) return;
    const now = Date.now();
    if (now - lastSyncRef.current < 15_000) return;
    lastSyncRef.current = now;
    void (async () => {
      try {
        await supabase.functions.invoke('check-subscription');
      } catch (e) {
        console.warn('[useAccountSubscription] check-subscription falhou:', e);
        return;
      }
      qc.invalidateQueries({ queryKey: ['account-subscription', user.id] });
      qc.invalidateQueries({ queryKey: ['seat-usage', user.id] });
    })();
  }, [user?.id, qc, query.data, query.isLoading]);

  const sub = query.data;
  const now = Date.now();

  const trialEndsMs = sub?.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : 0;
  const trialDaysLeft = sub?.status === 'trial'
    ? Math.max(0, Math.ceil((trialEndsMs - now) / (1000 * 60 * 60 * 24)))
    : 0;
  const trialExpired = sub?.status === 'trial' && trialEndsMs < now;
  /** Teste gratuito em andamento (cartão já salvo, cobrança automática ao final). */
  const isTrialing = sub?.status === 'trial' && trialEndsMs > now;
  /**
   * Ainda pode iniciar os 30 dias grátis: nunca teve assinatura no Stripe,
   * não é conta vitalícia e não está com assinatura ativa.
   */
  const trialEligible = !!sub
    && !sub.is_grandfathered
    && sub.status !== 'grandfathered'
    && sub.status !== 'active'
    && !sub.stripe_subscription_id;
  // Fase de cobrança recusada (carência antes da suspensão).
  const paymentPhase = getPaymentPhase(sub, now);
  const graceDaysLeft = getGraceDaysLeft(sub, now);
  const hasAccess = hasSubscriptionAccess(sub, now);

  return {
    subscription: sub,
    trialDaysLeft,
    trialExpired,
    isTrialing,
    trialEligible,
    hasAccess,
    /** 'ok' | 'grace' | 'suspended' */
    paymentPhase,
    inGracePeriod: paymentPhase === 'grace',
    graceDaysLeft,
    isLoading: query.isLoading,
  };
}


