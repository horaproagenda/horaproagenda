import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSeatUsage } from './useSeatUsage';

/**
 * Dispara toasts (e, opcionalmente, e-mail) quando a conta:
 *  - está a 1 assento do limite (aviso preventivo)
 *  - atingiu 100% do limite (bloqueante para novos colaboradores)
 *
 * Deduplica por chave para evitar spam quando a UI re-renderiza.
 */
export function useSeatThresholdNotifier() {
  const { user } = useAuth();
  const usage = useSeatUsage();
  const firedRef = useRef<Set<string>>(new Set());
  const lastEmailedRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!user?.id || !usage) return;
    if (usage.is_grandfathered) return;
    if (!usage.seat_limit || usage.seat_limit <= 0) return;

    const { used, seat_limit, available } = usage;
    const reached = used >= seat_limit;
    const near = !reached && available <= 1;

    const fire = (key: string, fn: () => void, sendEmailKind?: 'seats_near_limit' | 'seats_blocked') => {
      const dedupeKey = `${user.id}-${seat_limit}-${used}-${key}`;
      if (firedRef.current.has(dedupeKey)) return;
      firedRef.current.add(dedupeKey);
      fn();
      // expira em 5min — se mudou e voltou, notifica de novo
      setTimeout(() => firedRef.current.delete(dedupeKey), 300_000);

      if (sendEmailKind) {
        const emailKey = `${sendEmailKind}-${user.id}-${seat_limit}-${used}`;
        const last = lastEmailedRef.current[emailKey] ?? 0;
        // no máximo 1 e-mail do mesmo tipo a cada 24h
        if (Date.now() - last < 24 * 60 * 60 * 1000) return;
        lastEmailedRef.current[emailKey] = Date.now();
        supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'account-status-update',
            recipientEmail: user.email,
            idempotencyKey: emailKey,
            templateData: {
              kind: sendEmailKind,
              name: (user.user_metadata as { full_name?: string } | undefined)?.full_name ?? undefined,
              used,
              seatLimit: seat_limit,
            },
          },
        }).catch(() => { /* silencioso */ });
      }
    };

    if (reached) {
      fire('reached', () =>
        toast.warning('Limite de usuários atingido', {
          description: `Você está usando ${used} de ${seat_limit} assentos. Faça upgrade para adicionar mais colaboradores.`,
          duration: 12000,
        }),
        'seats_near_limit',
      );
    } else if (near) {
      fire('near', () =>
        toast.info('Quase no limite de usuários', {
          description: `Restam ${available} assento(s) no seu plano (${used}/${seat_limit}).`,
          duration: 10000,
        }),
        'seats_near_limit',
      );
    }
  }, [user, usage]);
}
