/**
 * Captura o convite de instalação do navegador (`beforeinstallprompt`) o mais
 * cedo possível — antes do React montar — porque o Chrome dispara o evento uma
 * única vez, logo no carregamento. Sem essa captura antecipada o botão de
 * "instalar aplicativo" pode nunca aparecer.
 */

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DONE_KEY = 'app-install-done';
const DISMISSED_AT_KEY = 'app-install-dismissed-at';
/** O aviso volta a aparecer depois desse período, caso tenha sido dispensado. */
export const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Listener = () => void;

let captured: BeforeInstallPromptEvent | null = null;
let installedFlag = false;
const listeners = new Set<Listener>();
let started = false;

function emit() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* ignora ouvinte com falha */
    }
  });
}

export function clearDoneFlag() {
  try {
    localStorage.removeItem(DONE_KEY);
  } catch {
    /* armazenamento indisponível */
  }
}

export function markInstalled() {
  installedFlag = true;
  captured = null;
  try {
    localStorage.setItem(DONE_KEY, 'true');
  } catch {
    /* armazenamento indisponível */
  }
  emit();
}

export function wasInstalledBefore() {
  try {
    return localStorage.getItem(DONE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function dismissInstall() {
  try {
    localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
  } catch {
    /* armazenamento indisponível */
  }
  emit();
}

export function isDismissed(now = Date.now()) {
  try {
    const raw = localStorage.getItem(DISMISSED_AT_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    if (now - at > DISMISS_TTL_MS) {
      localStorage.removeItem(DISMISSED_AT_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function isRunningInstalled() {
  if (typeof window === 'undefined') return false;
  if (installedFlag) return true;
  const standalone =
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.matchMedia?.('(display-mode: minimal-ui)')?.matches ||
    window.matchMedia?.('(display-mode: fullscreen)')?.matches;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return Boolean(standalone || iosStandalone);
}

export function getCapturedPrompt() {
  return captured;
}

export function consumeCapturedPrompt() {
  const evt = captured;
  captured = null;
  emit();
  return evt;
}

export function subscribeInstallPrompt(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Instala os ouvintes globais. Idempotente. */
export function initInstallPromptCapture() {
  if (started || typeof window === 'undefined') return;
  started = true;

  window.addEventListener('beforeinstallprompt', (event: Event) => {
    event.preventDefault();
    captured = event as BeforeInstallPromptEvent;
    // O navegador só oferece instalação quando o app NÃO está instalado.
    // Se havia registro de instalação anterior (usuário removeu o app),
    // esse registro está obsoleto e precisa ser apagado.
    installedFlag = false;
    clearDoneFlag();
    emit();
  });

  window.addEventListener('appinstalled', () => {
    markInstalled();
  });

  const media = window.matchMedia?.('(display-mode: standalone)');
  media?.addEventListener?.('change', (e: MediaQueryListEvent) => {
    if (e.matches) markInstalled();
  });

  // Confirma, quando o navegador suporta, se o app realmente continua instalado.
  const nav = window.navigator as Navigator & {
    getInstalledRelatedApps?: () => Promise<unknown[]>;
  };
  if (typeof nav.getInstalledRelatedApps === 'function') {
    void nav
      .getInstalledRelatedApps()
      .then((apps) => {
        if (!apps || apps.length === 0) {
          // Não está instalado: registro antigo não deve esconder o botão.
          installedFlag = false;
          clearDoneFlag();
          emit();
        }
      })
      .catch(() => {
        /* recurso indisponível: ignora */
      });
  }
}
