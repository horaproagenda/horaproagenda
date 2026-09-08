import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/lib/toast';
import { humanizeError } from '@/lib/humanError';

export interface SeatUsage {
  used: number;
  seat_limit: number;
  available: number;
  is_grandfathered: boolean;
}

/** Uso atual de assentos da conta (vinculado ao plano contratado no Asaas). */
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
    staleTime: 5_000,
  });

  // Invalida em tempo real quando perfis, profissionais, papéis ou assinatura mudam
  useEffect(() => {
    if (!user?.id) return;
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ['seat-usage', user.id] });
      qc.invalidateQueries({ queryKey: ['account-users'] });
    };
    const ch = supabase.channel(`seat-usage-${user.id}`);
    for (const table of ['profiles', 'professionals', 'user_roles', 'account_subscriptions']) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ch.on('postgres_changes', { event: '*', schema: 'public', table } as any, invalidate);
    }
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, qc]);

  return query.data ?? null;
}

/** Revisa a conta e libera vagas de cadastros já apagados. */
export function useReconcileSeats() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<number> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('reconcile_account_seats');
      if (error) throw error;
      return typeof data === 'number' ? data : 0;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seat-usage', user?.id] });
      qc.invalidateQueries({ queryKey: ['account-users'] });
      qc.invalidateQueries({ queryKey: ['professionals'] });
    },
    onError: (error: unknown) => {
      toast.error(humanizeError(error));
    },
  });
}
