import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { logVersionEvent } from '@/lib/appVersionLog';
import { captureFormState } from '@/lib/preReloadState';
import { isUserBusyInDialog } from '@/lib/userBusyGuard';

/**
 * useVersionWatcher
 *
 * Detector de novas versões INDEPENDENTE do Service Worker.
 *
 * Por que existe: em alguns navegadores/dispositivos o Service Worker
 * pode falhar (bloqueado, modo anônimo, falha de cache, etc.) e o app
 * fica preso em uma build antiga. Este watcher complementa o
 * `useAppUpdater` baixando o `index.html` periodicamente com bypass de
 * cache e comparando a "assinatura" dos assets carregados (hashes dos
 * scripts injetados pelo Vite). Se mudou -> nova build publicada -> recarrega.
 *
 * Estratégia:
 *  - Captura a assinatura inicial dos <script src="/assets/*.js"> da página atual.
 *  - A cada 30s (e ao voltar foco/online) faz `fetch('/index.html?ts=...', { cache: 'no-store' })`
 *  - Extrai os srcs dos scripts e compara.
 *  - Diferente -> mostra toast e recarrega em 4s (ou imediatamente se o
 *    usuário clicar em "Atualizar agora").
 *  - Failsafe: se falhar 5x seguidas, para de checar (rede ruim).
 */
export function useVersionWatcher() {
  const reloadingRef = useRef(false);
  const failuresRef = useRef(0);

  useEffect(() => {
    // Em dev, não vale a pena (HMR já cuida disso)
    if (import.meta.env.DEV) return;

    const triggerReload = (reason: string) => {
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      captureFormState(reason);
      logVersionEvent('reload_triggered', { reason });
      window.location.reload();
    };

    logVersionEvent('watcher_started');

    const getCurrentSignature = (): string => {
      const scripts = Array.from(document.querySelectorAll('script[src]')) as HTMLScriptElement[];
      return scripts
        .map((s) => s.src)
        .filter((src) => src.includes('/assets/'))
        .sort()
        .join('|');
    };

    const initialSignature = getCurrentSignature();
    if (!initialSignature) return; // SSR/prerender ou ambiente atípico

    const promptUpdate = () => {
      logVersionEvent('new_version_detected');
      toast.success('Nova versão disponível!', {
        description: 'Atualizando para garantir que tudo esteja sincronizado...',
        duration: 5000,
        icon: '🚀',
        action: {
          label: 'Atualizar agora',
          onClick: () => triggerReload('user_action'),
        },
      });
      setTimeout(() => triggerReload('auto_after_detection'), 4000);
    };

    const checkVersion = async () => {
      try {
        const res = await fetch(`/index.html?ts=${Date.now()}`, {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const matches = Array.from(html.matchAll(/<script[^>]+src=["']([^"']+\/assets\/[^"']+)["']/g));
        const remoteSignature = matches.map((m) => m[1]).sort().join('|');
        if (!remoteSignature) {
          failuresRef.current += 1;
          logVersionEvent('check_fail', { reason: 'no_assets_in_html' });
          return;
        }
        failuresRef.current = 0;

        const stripOrigin = (sig: string) =>
          sig
            .split('|')
            .map((u) => u.split('/assets/').pop() || u)
            .sort()
            .join('|');

        const remote = stripOrigin(remoteSignature);
        const local = stripOrigin(initialSignature);
        if (remote !== local) {
          console.log('[VersionWatcher] Nova versão detectada — recarregando app');
          promptUpdate();
        } else {
          logVersionEvent('check_ok');
        }
      } catch (err) {
        failuresRef.current += 1;
        logVersionEvent('check_fail', {
          message: err instanceof Error ? err.message : String(err),
          consecutive: failuresRef.current,
        });
        if (failuresRef.current < 5) {
          console.warn('[VersionWatcher] Falha ao checar versão:', err);
        }
      }
    };

    // Polling a cada 30s
    const interval = window.setInterval(() => {
      if (failuresRef.current >= 5) return;
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      void checkVersion();
    }, 30_000);

    const onFocus = () => {
      failuresRef.current = 0;
      void checkVersion();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        failuresRef.current = 0;
        void checkVersion();
      }
    };
    const onOnline = () => {
      failuresRef.current = 0;
      void checkVersion();
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);

    // Checagem imediata na inicialização (especialmente importante para PWA
    // aberta após muito tempo: detecta novo SW/build antes do usuário interagir).
    const initialCheck = window.setTimeout(checkVersion, 800);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(initialCheck);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}
