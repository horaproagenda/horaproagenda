import { useCallback, useEffect, useState } from 'react';
import {
  consumeCapturedPrompt,
  dismissInstall,
  getCapturedPrompt,
  initInstallPromptCapture,
  isDismissed,
  isRunningInstalled,
  markInstalled,
  subscribeInstallPrompt,
} from '@/lib/installPrompt';

function detectIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIPhoneOrIPad = /iPad|iPhone|iPod/.test(ua);
  const isIPadOS = /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1;
  return isIPhoneOrIPad || isIPadOS;
}

function inIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Suporte a "adicionar à tela inicial" (celular) e "instalar" (notebook/tablet).
 *
 * Regras:
 * - o botão só aparece quando o aplicativo NÃO está instalado;
 * - se o usuário remover o aplicativo, o botão volta a aparecer;
 * - sem convite automático do navegador, mostramos as instruções manuais.
 */
export function useInstallPrompt() {
  const [tick, setTick] = useState(0);
  const isIOS = detectIOS();
  const embedded = typeof window !== 'undefined' ? inIframe() : true;

  useEffect(() => {
    initInstallPromptCapture();
    const unsubscribe = subscribeInstallPrompt(() => setTick((t) => t + 1));

    // Reavalia ao voltar para a aba: o usuário pode ter removido o aplicativo.
    const onVisible = () => setTick((t) => t + 1);
    window.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      unsubscribe();
      window.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  // `tick` força a releitura do estado atual (instalado / convite disponível).
  void tick;
  const isInstalled = isRunningInstalled();
  const canPrompt = Boolean(getCapturedPrompt());
  const dismissed = isDismissed();

  const promptInstall = useCallback(async () => {
    const evt = consumeCapturedPrompt();
    if (!evt) return 'unavailable' as const;
    await evt.prompt();
    const choice = await evt.userChoice;
    if (choice.outcome === 'accepted') markInstalled();
    return choice.outcome;
  }, []);

  const dismiss = useCallback(() => {
    dismissInstall();
  }, []);

  const showButton = !embedded && !isInstalled && !dismissed;

  return { showButton, canPrompt, isInstalled, isIOS, promptInstall, dismiss };
}
