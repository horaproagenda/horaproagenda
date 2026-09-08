import { useCallback, useEffect, useRef, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DONE_KEY = 'app-install-done';
const DISMISSED_KEY = 'app-install-dismissed';

function readFlag(key: string) {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function writeFlag(key: string) {
  try {
    localStorage.setItem(key, 'true');
  } catch {
    /* armazenamento indisponível: ignora */
  }
}

function detectInstalled() {
  if (typeof window === 'undefined') return false;
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return Boolean(standalone || iosStandalone);
}

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
 * Suporte a "adicionar à tela inicial" (celular) e "instalar" (notebook/desktop).
 * Não registra service worker: a instalação vem do manifesto do app.
 */
export function useInstallPrompt() {
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [canPrompt, setCanPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(() => detectInstalled());
  const [hidden, setHidden] = useState(() => readFlag(DONE_KEY) || readFlag(DISMISSED_KEY));
  const isIOS = detectIOS();
  const embedded = typeof window !== 'undefined' ? inIframe() : true;

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      promptRef.current = event as BeforeInstallPromptEvent;
      setCanPrompt(true);
    };
    const onInstalled = () => {
      promptRef.current = null;
      setCanPrompt(false);
      setIsInstalled(true);
      writeFlag(DONE_KEY);
      setHidden(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    const media = window.matchMedia?.('(display-mode: standalone)');
    const onDisplayChange = (e: MediaQueryListEvent) => {
      if (e.matches) onInstalled();
    };
    media?.addEventListener?.('change', onDisplayChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      media?.removeEventListener?.('change', onDisplayChange);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const evt = promptRef.current;
    if (!evt) return 'unavailable' as const;
    await evt.prompt();
    const choice = await evt.userChoice;
    promptRef.current = null;
    setCanPrompt(false);
    if (choice.outcome === 'accepted') {
      writeFlag(DONE_KEY);
      setHidden(true);
      setIsInstalled(true);
    }
    return choice.outcome;
  }, []);

  const dismiss = useCallback(() => {
    writeFlag(DISMISSED_KEY);
    setHidden(true);
  }, []);

  // O botão só existe quando ainda faz sentido instalar.
  const showButton = !embedded && !isInstalled && !hidden && (canPrompt || isIOS);

  return { showButton, canPrompt, isInstalled, isIOS, promptInstall, dismiss };
}
