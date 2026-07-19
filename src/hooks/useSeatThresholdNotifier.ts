import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSeatUsage } from './useSeatUsage';
import { shouldSuggestUpgrade } from '@/lib/seatUsage';

/**
 * Dispara toast (e e-mail opcional) SOMENTE quando a conta está acima do
 * limite contratado (`used > seat_limit`) — cenário típico de downgrade ou
 * remoção de assentos via Stripe que deixou colaboradores excedentes.
 *
 * Regra explícita do produto (2026-07): não sugerir upgrade quando o usuário
 * pago está DENTRO do seu seat_limit correto, mesmo estando exatamente no
 * limite (ex.: plano de 1 usuário com 1 ativo).
 */
export function useSeatThresholdNotifier() {
  const { user } = useAuth();
  const usage = useSeatUsage();
  const firedRef = useRef<Set<string>>(new Set());
  const lastEmailedRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!user?.id || !usage) return;
    const kind = shouldSuggestUpgrade(usage);
    if (kind !== 'over') return;

    const { used, seat_limit } = usage;
    const dedupeKey = `${user.id}-${seat_limit}-${used}-over`;
    if (firedRef.current.has(dedupeKey)) return;
    firedRef.current.add(dedupeKey);
    setTimeout(() => firedRef.current.delete(dedupeKey), 300_000);

    toast.warning('Assentos acima do plano', {
      description: `Você tem ${used} usuários ativos, mas seu plano cobre ${seat_limit}. Faça upgrade ou inative colaboradores.`,
      duration: 12000,
    });

    const emailKey = `seats_over-${user.id}-${seat_limit}-${used}`;
    const last = lastEmailedRef.current[emailKey] ?? 0;
    if (Date.now() - last < 24 * 60 * 60 * 1000) return;
    lastEmailedRef.current[emailKey] = Date.now();
    supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'account-status-update',
        recipientEmail: user.email,
        idempotencyKey: emailKey,
        templateData: {
          kind: 'seats_near_limit',
          name: (user.user_metadata as { full_name?: string } | undefined)?.full_name ?? undefined,
          used,
          seatLimit: seat_limit,
        },
      },
    }).catch(() => { /* silencioso */ });
  }, [user, usage]);
}
