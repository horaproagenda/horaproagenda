import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * useCrossDeviceSync
 *
 * Garante que TODA visualização aberta (celular, tablet, desktop, link
 * compartilhado, PWA instalada) reflita imediatamente qualquer alteração
 * feita em outro dispositivo, mesmo se o canal Realtime do Supabase cair
 * temporariamente.
 *
 * Estratégias combinadas:
 *  1. Refetch global ao recuperar foco (`focus`) ou voltar a ficar visível
 *     (`visibilitychange`) — cobre o cenário "abri o link, mostre dados novos".
 *  2. Refetch global ao voltar online (`online`).
 *  3. Heartbeat a cada 30s para refazer queries ATIVAS — pega qualquer
 *     mudança que tenha escapado do WebSocket Realtime.
 *  4. Reconexão automática do canal Realtime se o socket cair
 *     (`SUBSCRIBED` -> `CLOSED` -> resubscribe).
 *  5. Sincronização entre abas do MESMO navegador via `BroadcastChannel`:
 *     quando uma aba faz mutation, todas as outras invalidam o cache.
 */
export function useCrossDeviceSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let lastInvalidate = 0;
    const invalidateAll = (reason: string) => {
      const now = Date.now();
      // Throttle: no máximo 1 refetch global a cada 1.5s
      if (now - lastInvalidate < 1500) return;
      lastInvalidate = now;
      console.log(`[CrossDeviceSync] Sincronizando dados (${reason})`);
      void queryClient.invalidateQueries({
        predicate: () => true,
        refetchType: 'active',
      });
    };

    // 1. Foco/visibilidade -> revalida tudo
    const handleFocus = () => invalidateAll('focus');
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') invalidateAll('visible');
    };
    const handleOnline = () => invalidateAll('online');

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    // 2. Heartbeat de segurança (a cada 30s) — só refetch ativo
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        invalidateAll('heartbeat');
      }
    }, 30_000);

    // 3. Sincronização entre abas via BroadcastChannel
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('app-data-sync');
      bc.onmessage = (event) => {
        if (event?.data?.type === 'invalidate') {
          invalidateAll('broadcast');
        }
      };
      // Disponibiliza um helper global p/ outras partes do app emitirem
      (window as unknown as { __broadcastDataChange?: () => void }).__broadcastDataChange = () => {
        try {
          bc?.postMessage({ type: 'invalidate', at: Date.now() });
        } catch (e) {
          console.warn('[CrossDeviceSync] broadcast falhou', e);
        }
      };
    } catch (e) {
      console.warn('[CrossDeviceSync] BroadcastChannel indisponível', e);
    }

    // 4. Watchdog do canal Realtime — se cair, força refetch e tenta reconectar
    const heartbeatChannel = supabase.channel('cross-device-heartbeat');
    heartbeatChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        invalidateAll('realtime-subscribed');
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // Tenta reconectar em 3s
        window.setTimeout(() => {
          try {
            heartbeatChannel.subscribe();
          } catch {
            /* noop */
          }
        }, 3000);
      }
    });

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(heartbeat);
      try {
        bc?.close();
      } catch {
        /* noop */
      }
      try {
        supabase.removeChannel(heartbeatChannel);
      } catch {
        /* noop */
      }
      delete (window as unknown as { __broadcastDataChange?: () => void }).__broadcastDataChange;
    };
  }, [queryClient]);
}

/**
 * Helper para emitir uma notificação de mudança de dados para
 * outras abas do mesmo navegador. Pode ser chamado de qualquer
 * mutation bem-sucedida (`onSuccess`).
 */
export function broadcastDataChange() {
  try {
    const fn = (window as unknown as { __broadcastDataChange?: () => void }).__broadcastDataChange;
    fn?.();
  } catch {
    /* noop */
  }
}
