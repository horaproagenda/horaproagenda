import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logSyncEvent } from '@/lib/syncAudit';

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
    const invalidateAll = (reason: string, opts?: { force?: boolean }) => {
      const now = Date.now();
      // Throttle padrão: 30s entre refetches globais. Eventos críticos
      // (boot, login, retorno online, link novo) usam `force: true` para
      // sincronizar imediatamente.
      if (!opts?.force && now - lastInvalidate < 30_000) return;
      lastInvalidate = now;
      console.log(`[CrossDeviceSync] Sincronizando dados (${reason})`);
      void queryClient.invalidateQueries({
        predicate: () => true,
        refetchType: 'active',
      });
    };

    // 0. Refetch imediato no mount — qualquer link/aba/dispositivo recém-aberto
    //    deve baixar a versão mais recente antes que a UI mostre dados em cache.
    invalidateAll('mount', { force: true });

    // 1. Foco/visibilidade -> revalida tudo (com throttle)
    const handleFocus = () => invalidateAll('focus');
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') invalidateAll('visible');
    };
    const handleOnline = () => invalidateAll('online', { force: true });

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    // 2. Heartbeat de fundo (a cada 60s) — fallback caso o Realtime falhe.
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        invalidateAll('heartbeat');
      }
    }, 60_000);


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

    // 5. Em cada login / refresh de sessão -> força refetch global imediato.
    // Garante que ao abrir o app em um novo celular/notebook/navegador, os
    // dados mais recentes do servidor sejam baixados antes da UI renderizar
    // qualquer valor obsoleto vindo de cache local.
    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        invalidateAll(`auth:${event}`, { force: true });
      }
      if (event === 'SIGNED_OUT') {
        queryClient.clear();
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
      try {
        authSub.subscription.unsubscribe();
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
