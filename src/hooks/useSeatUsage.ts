import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface SeatUsage {
  used: number;
  seat_limit: number;
  available: number;
  is_grandfathered: boolean;
}

/** Uso atual de assentos da conta (vinculado ao plano comprado no Stripe). */
export function useSeatUsage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['seat-usage', user?.id],
    queryFn: async (): Promise<SeatUsage | null> => {
      if (!user?.id) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('get_seat_usage');
      if (error) {
        console.warn('get_seat_usage error:', error);
        return null;
      }
      const row = Array.isArray(data) ? data[0] : data;
      return row ?? null;
    },
    enabled: !!user?.id,
    staleTime: 15_000,
  });

  // Invalida quando profiles ou account_subscriptions mudam
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`seat-usage-${user.id}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' } as any,
        () => qc.invalidateQueries({ queryKey: ['seat-usage', user.id] }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes', { event: '*', schema: 'public', table: 'account_subscriptions' } as any,
        () => qc.invalidateQueries({ queryKey: ['seat-usage', user.id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, qc]);

  return query.data ?? null;
}
