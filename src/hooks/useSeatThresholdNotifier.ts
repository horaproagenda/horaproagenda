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
    // Só notifica quando o uso *ultrapassa* o limite (downgrade ou remoção de assentos
    // pelo Stripe deixou colaboradores acima do plano). Estar exatamente no limite
    // com o próprio dono (ex.: plano de 1 usuário) é o estado normal e não deve
    // gerar toast de "faça upgrade".
    const over = used > seat_limit;
    // "Quase no limite" só faz sentido para planos com mais de 1 assento.
    const near = !over && seat_limit > 1 && available === 0;

    const fire = (key: string, fn: () => void, sendEmailKind?: 'seats_near_limit' | 'seats_blocked') => {
      const dedupeKey = `${user.id}-${seat_limit}-${used}-${key}`;
      if (firedRef.current.has(dedupeKey)) return;
      firedRef.current.add(dedupeKey);
      fn();
      setTimeout(() => firedRef.current.delete(dedupeKey), 300_000);

      if (sendEmailKind) {
        const emailKey = `${sendEmailKind}-${user.id}-${seat_limit}-${used}`;
        const last = lastEmailedRef.current[emailKey] ?? 0;
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

    if (over) {
      fire('over', () =>
        toast.warning('Assentos acima do plano', {
          description: `Você tem ${used} usuários ativos, mas seu plano cobre ${seat_limit}. Faça upgrade ou inative colaboradores.`,
          duration: 12000,
        }),
        'seats_near_limit',
      );
    } else if (near) {
      fire('near', () =>
        toast.info('Sem assentos disponíveis', {
          description: `Você usou ${used}/${seat_limit}. Faça upgrade para adicionar mais colaboradores.`,
          duration: 10000,
        }),
        'seats_near_limit',
      );
    }
  }, [user, usage]);
}
