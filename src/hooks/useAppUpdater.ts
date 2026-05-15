import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { logVersionEvent } from '@/lib/appVersionLog';
import { captureFormState } from '@/lib/preReloadState';
import { isUserBusyInDialog } from '@/lib/userBusyGuard';

/**
 * useAppUpdater
 *
 * Garante que toda nova versão publicada do aplicativo seja entregue
 * imediatamente para TODOS os dispositivos (PWA instalada no celular,
 * tablet, notebook ou link aberto no navegador).
 *
 * Estratégia:
 * 1. O Service Worker (vite-plugin-pwa em modo `autoUpdate` + `skipWaiting`
 *    + `clientsClaim`) busca novas versões periodicamente.
 * 2. Quando uma nova versão é detectada, mostramos um toast pedindo para
 *    o usuário recarregar — e também forçamos reload automático após
 *    poucos segundos para evitar que fiquem em versões antigas.
 * 3. Polling a cada 60s para checar update mesmo sem o usuário navegar.
 * 4. Reage também a `visibilitychange` (quando o app volta ao foco) e
 *    ao evento `controllerchange` do Service Worker.
 */
export function useAppUpdater() {
  const reloadingRef = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;
    let updateInterval: number | null = null;

    const triggerReload = (reason: string = 'sw_update') => {
      if (reloadingRef.current) return;
      // Posterga reload se o usuário estiver com diálogo aberto preenchendo dados
      if (isUserBusyInDialog()) {
        logVersionEvent('reload_postponed_user_busy', { reason, source: 'sw' });
        window.setTimeout(() => triggerReload(reason), 30_000);
        return;
      }
      reloadingRef.current = true;
      captureFormState(reason);
      logVersionEvent('reload_triggered', { reason, source: 'sw' });
      window.location.reload();
    };

    const promptUpdate = (waiting: ServiceWorker | null) => {
      logVersionEvent('sw_update_found');
      toast.success('Nova versão disponível!', {
        description: 'Atualizando o aplicativo automaticamente...',
        duration: 5000,
        icon: '🚀',
        action: {
          label: 'Atualizar agora',
          onClick: () => {
            waiting?.postMessage({ type: 'SKIP_WAITING' });
            triggerReload();
          },
        },
      });

      // Auto-update: pede para o SW assumir e recarrega em 4s
      setTimeout(() => {
        waiting?.postMessage({ type: 'SKIP_WAITING' });
      }, 1000);

      setTimeout(() => {
        triggerReload();
      }, 4000);
    };

    const checkForUpdate = async () => {
      try {
        await registration?.update();
      } catch (e) {
        console.warn('[AppUpdater] Falha ao checar atualização:', e);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      registration = reg;

      // Já existe um SW aguardando ativação?
      if (reg.waiting) promptUpdate(reg.waiting);

      // Detecta novas instalações
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            promptUpdate(newWorker);
          }
        });
      });

      // Polling agressivo a cada 15s — garante que toda nova versão
      // publicada seja detectada rapidamente em qualquer dispositivo.
      updateInterval = window.setInterval(checkForUpdate, 15_000);
      // Checagem imediata no boot (PWA pode estar aberta há dias) +
      // re-checagem rápida em 2s para pegar SW que demorou a registrar.
      checkForUpdate();
      window.setTimeout(checkForUpdate, 2_000);
    });

    // Failsafe: limpa caches HTTP antigos do navegador no boot,
    // evitando que assets obsoletos do PWA "vazem" para uma nova sessão.
    if ('caches' in window) {
      caches.keys().then((keys) => {
        keys
          .filter((k) => k.startsWith('html-cache') || k.startsWith('workbox-precache'))
          .forEach((k) => {
            // mantém o mais recente; remove duplicados antigos
            if (k.includes('-old') || k.endsWith('-v1')) {
              caches.delete(k).catch(() => {});
            }
          });
      }).catch(() => {});
    }

    // Quando o controlador muda (SW novo assumiu), recarrega para garantir bundle novo
    const onControllerChange = () => {
      logVersionEvent('sw_controller_change');
      triggerReload('sw_controller_change');
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', checkForUpdate);

    return () => {
      if (updateInterval) window.clearInterval(updateInterval);
      if ('serviceWorker' in navigator && navigator.serviceWorker?.removeEventListener) {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      }
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', checkForUpdate);
    };
  }, []);
}
